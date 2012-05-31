var CONSTANTS = require('./CONSTANTS');
var ZooKeeper = require('zookeeper');

var zk = undefined;

/*{{{ init() */
exports.init = function(zkObj){
  zk = zkObj;
}
/*}}}*/

/*{{{ del()*/
/**
 * 删除节点
 * @param {string}   path 节点路径
 * @param {function} cb   回调函数
 */
exports.del = function(path,cb){
  zk.a_delete_(path,CONSTANTS.DEL_VERSION,function(rc,error){
    (rc != 0) ? cb(error) : cb();
  });
}
/*}}}*/

/*{{{ get()*/
/**
 * 获取节点保存的value
 * @param {string}   path  节点路径
 * @param {function} cb    回调函数
 * @param {function} w_cb  watch回调函数
 */
exports.get = function(path,cb,w_cb){
  if(w_cb === undefined){
    zk.a_get(path,false,function(rc,error,stat,data){
      (rc != 0) ? cb(error) : cb('',data);
    });

  }else{
    zk.aw_get(path
      ,innerW_cb
      ,function(rc,error,stat,data){
        (rc != 0) ? cb(error) : cb('',data);
      }
    );
    
    function innerW_cb(type,state,rePath){
      if(type !== ZooKeeper.ZOO_SESSION_EVENT){
        zk.aw_get(path,innerW_cb,function(rc,error,stat,data){
          (rc != 0) ? w_cb(error) : w_cb();
        });
      }
    }
  }

}
/*}}}*/

/*{{{ set()*/
/**
 * 设置节点value
 * @param {string}   path 节点路径 
 * @param {object}   obj  需要保存的信息
 * @param {function} cb   回调函数
 */
exports.set = function (path,obj,cb){
  zk.a_set(path,JSON.stringify(obj),CONSTANTS.SET_VERSION
    ,function(rc,error,stat){
      (rc != 0) ? cb(error) : cb('',stat);
    }
  );
}
/*}}}*/

/*{{{ ifExist()*/
/**
 * 判断节点是否存在
 * @param {string}   path  节点路径
 * @param {function} cb    回调函数
 * @param {function} w_cb  watch回调函数
 */
exports.ifExist = function(path,cb,w_cb){
  if(w_cb === undefined){
    zk.a_exists(path,false,function(rc,error,stat){
      (rc != 0) ? cb(error) : cb('');
    });
  }else{
    zk.aw_exists(path
      ,innerW_cb
      ,function(rc,error){
        (rc != 0) ? cb(error) : cb('');
      }
    );

    function innerW_cb(type,state,rePath){
      if(type !== ZooKeeper.ZOO_SESSION_EVENT){
        zk.aw_exists(path,innerW_cb,function(rc,error,stat){
          (rc != 0) ? w_cb(error) : w_cb();
        });
      }
    }
  }
}
/*}}}*/

/*{{{ getChildren()*/
/**
 * 获得子节点
 * @param {string} path   节点路径
 * @param {string} cb     回调函数
 * @param {string} w_cb   watch回调函数
 * @param {object} signal 回调起不起作用的标志
 */
exports.getChildren = function(path,cb,w_cb,signal){
  if(w_cb === undefined){
    zk.a_get_children(path,false,function(rc,error,children){
      (rc != 0) ? cb(error) : cb('',children);
    });

  }else{
    zk.aw_get_children(path
      ,innerW_cb
      ,function(rc,error,children){
        (rc != 0) ? cb(error) : cb('',children);
      }
    );

    function innerW_cb(type,state,rePath){
      if(signal && !signal.call){return;}
      if(type !== ZooKeeper.ZOO_SESSION_EVENT){
        zk.aw_get_children(path,innerW_cb,function(rc,error,children){
          (rc != 0) ? w_cb(error) : w_cb('',children);
        });
      }
    }

  }
}
/*}}}*/

/*{{{ createNode()*/
/**
 * 创建节点
 * @param {string} path 节点路径
 * @param {string} obj  存储的信息对象
 * @param {string} type 节点类型
 * @param {string} cb   创建好节点后的回调
 */
exports.createNode = function(path,obj,type,cb){
  zk.a_create(path,JSON.stringify(obj),type,function(rc,error,path){
    (rc != 0) ? cb(error) : cb('',path);
  });
}
/*}}}*/
