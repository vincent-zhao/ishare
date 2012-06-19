/**
 * zk基本操作工具文件
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */


var Event     = require('events').EventEmitter;
var CONSTANTS = require('./CONSTANTS');
var ZooKeeper = require('zookeeper');
var MyError   = require('./classes/Error');

var zk = undefined;

/*{{{ init() */
exports.init = function (zkObj) {
  zk = zkObj;
}
/*}}}*/

/*{{{ del()*/
/**
 * 删除节点
 * @param {string}   path 节点路径
 */
exports.del = function (path, version) {
  var event = new Event();
  zk.a_delete_(path, version, function (rc, error) {
    if (rc != 0) {
      event.emit('err', new MyError('ZK_DELETE_ERROR', error));
    } else {
      event.emit('ok');
    }
  });
  return event;
}
/*}}}*/

/*{{{ get()*/
/**
 * 获取节点保存的value
 * @param {string}   path   节点路径
 * @param {bool}     listen 是否监听变化
 */
exports.get = function (path, listen) {
  var event = new Event();
  if (!listen) {
    zk.a_get(path, false, function (rc, error, stat, data) {
      if (rc != 0) {
        event.emit('err', new MyError('ZK_GET_ERROR', error));
      } else {
        var get;
        try {
          get = JSON.parse(data);
        } catch(e) {
          event.emit('err', new MyError('JSON_PARSE_ERROR'));
        }
        event.emit('ok', stat, get);
      }
    });

  } else {
    zk.aw_get(path, w_cb, function (rc, error, stat, data) {
        if (rc != 0 ) {
          event.emit('err', new MyError('ZK_GET_ERROR', error));
        } else {
          var get;
          try {
            get = JSON.parse(data);
          } catch(e) {
            event.emit('err', new MyError('JSON_PARSE_ERROR'));
          }
          event.emit('ok', stat, get);
        }
      }
    );
    
    function w_cb(type, state, rePath) {
      if (event.useless === true) {
        return;
      }

      if (type !== ZooKeeper.ZOO_SESSION_EVENT) {
        zk.aw_get(path, w_cb, function (rc, error, stat, data) {
          if (event.useless === true) {
            return;
          }

          if (rc != 0) {
            event.emit('err', new MyError('ZK_GET_ERROR', error));
          } else {
            var get;
            try {
              get = JSON.parse(data);
            } catch(e) {
              event.emit('err', new MyError('JSON_PARSE_ERROR'));
            }
            event.emit('update', stat, get);
          }
        });
      }
    }
  }

  return event;
}
/*}}}*/

/*{{{ get2()*/
/**
 * 获取节点保存的value
 * @param {string}   path   节点路径
 */
exports.get2 = function (path) {
  var event = new Event();
  zk.aw_get(path, w_cb, function (rc, error, stat, data) {
    if (rc != 0 ) {
      zk.aw_exists(path, function (type, state, path) {
        if (type === ZooKeeper.ZOO_CREATED_EVENT) {
          innerGet();
        }
      }, function (rc, error, stat) {
        if(rc === 0){
          innerGet();
        }
      });
    } else {
      var get;
      try {
        get = JSON.parse(data);
      } catch(e) {
        event.emit('err', new MyError('JSON_PARSE_ERROR'));
      }
      event.emit('ok', stat, get);
    }
  });
  
  function innerGet(){
    zk.aw_get(path, w_cb, function (rc, error, stat, data) {
      if (event.useless === true) {
        return;
      }

      if (rc != 0) {
        event.emit('err', new MyError('ZK_GET_ERROR', error));
      } else {
        var get;
        try {
          get = JSON.parse(data);
        } catch(e) {
          event.emit('err', new MyError('JSON_PARSE_ERROR'));
        }
        event.emit('update', stat, get);
      }
    });
  }

  function w_cb(type, state, rePath) {
    if (event.useless === true) {
      return;
    }

    if (type !== ZooKeeper.ZOO_SESSION_EVENT) {
      if (type === ZooKeeper.ZOO_DELETED_EVENT) {
        event.emit('delete'); 

        zk.aw_exists(path, function (type, state, path) {
          if (type === ZooKeeper.ZOO_CREATED_EVENT) {
            innerGet();
          }
        }, function (rc, error, stat) {
          if(rc === 0){
            innerGet();
          }
        });

      } else if (type === ZooKeeper.ZOO_CHANGED_EVENT){
        innerGet();
      }
    }
  }

  return event;
}
/*}}}*/

/*{{{ set()*/
/**
 * 设置节点value
 * @param {string}   path 节点路径 
 * @param {object}   obj  需要保存的信息
 */
exports.set = function (path,obj) {
  var event = new Event();
  zk.a_set(path, JSON.stringify(obj), CONSTANTS.SET_VERSION, function (rc, error, stat) {
      if (rc != 0) {
        event.emit('err', new MyError('ZK_SET_ERROR', error));
      } else {
        event.emit('ok', stat);
      }
    }
  );
  return event;
}
/*}}}*/

/*{{{ ifExist()*/
/**
 * 判断节点是否存在
 * @param {string}   path  节点路径
 * @param {bool}     listen 是否监听变化
 */
exports.ifExist = function(path,listen){
  var event = new Event();
  if (listen === undefined) {
    zk.a_exists(path, false, function (rc, error, stat) {
      if (rc != 0) {
        event.emit('err', new MyError('ZK_EXIST_ERROR', error));
      } else {
        event.emit('ok', stat);
      }
    });
  } else {
    zk.aw_exists(path, w_cb
      ,function(rc, error, stat){
        if (rc != 0) {
          event.emit('err', new MyError('ZK_EXIST_ERROR', error));
        } else {
          event.emit('ok', stat);
        }
      }
    );

    function w_cb(type, state, rePath){
      if (event.useless === true) {
        return;
      }

      if (type !== ZooKeeper.ZOO_SESSION_EVENT) {
        zk.aw_exists(path, w_cb, function(rc, error, stat){
          if (event.useless === true) {
            return;
          }

          if (rc != 0) {
            event.emit('err', new MyError('ZK_EXIST_ERROR', error));
          } else {
            event.emit('update', stat);
          }
        });
      }
    }
  }
  return event;
}
/*}}}*/

/*{{{ getChildren()*/
/**
 * 获得子节点
 * @param {string} path   节点路径
 * @param {bool}   listen 是否监听变化
 */
exports.getChildren = function (path, listen) {
  var event = new Event();
  if (listen === undefined) {
    zk.a_get_children(path, false, function (rc, error, children) {
      if (rc != 0) {
        event.emit('err', new MyError('ZK_GET_CHILDREN_ERROR', error));
      } else {
        event.emit('ok', children);
      }
    });

  }else{
    zk.aw_get_children(path, w_cb, function(rc, error, children){
        if (rc != 0) {
          event.emit('err', new MyError('ZK_GET_CHILDREN_ERROR', error));
        } else {
          event.emit('ok', children);
        }
      }
    );

    function w_cb(type, state, rePath) {
      if (event.useless === true) {
        return;
      }

      if (type !== ZooKeeper.ZOO_SESSION_EVENT) {
        zk.aw_get_children(path, w_cb, function (rc, error, children) {
          if (event.useless === true) {
            return;
          }

          if (rc != 0) {
            event.emit('err', new MyError('ZK_GET_CHILDREN_ERROR', error));
          } else {
            event.emit('update', children);
          }
        });
      }
    }
  }
  return event;
}
/*}}}*/

/*{{{ createNode()*/
/**
 * 创建节点
 * @param {string} path 节点路径
 * @param {string} obj  存储的信息对象
 * @param {string} type 节点类型
 */
exports.createNode = function (path, obj, type) {
  var event = new Event();
  zk.a_create(path, JSON.stringify(obj), type, function(rc, error, path){
    if (rc != 0) {
      event.emit('err', new MyError('ZK_CREATE_ERROR', error));
    } else {
      event.emit('ok', path);
    }
  });
  return event;
}
/*}}}*/

