/* vim: set expandtab tabstop=2 shiftwidth=2 foldmethod=marker: */

var os = require('os');
var fs = require('fs');
var exec = require('child_process').exec;
var ZooKeeper = require('zookeeper');

var zk;
var zkInfo; 
var local;

var fileName = 'local';
var root = '/service';
//检测服务是否正常的等待时间
var checkTm = 1000;
//心跳检测时间间隔
var checkInterval = 500;
//for test
var ran = 0;
//全局控制zk是否可用的变量
var connected = false;

//本地缓存
var localCache = {};
//回调函数队列，用来处理并发的相同请求
var callbackArr = {};
//watch函数（监听函数）队列
var w_callbackArr = {};
//定时器id数组
var ids = [];

/*{{{ CONSTANTS */
var CONSTANTS = {
  'TIME_OUT'     : 2000,
  'HOST_ORDER'   : false,
  'VER_NODE_TYPE': 0,
  'REG_NODE_TYPE': ZooKeeper.ZOO_EPHEMERAL,

  'DEL_VERSION'  : 0,
  'SET_VERSION'  : 0,

  'RECENT'  : '0',
}
/*}}}*/

/*{{{ service constructor*/
/**
 * 客户端对象构造函数
 * @param {string} path     服务节点路径
 * @param {object} nodeInfo 节点信息
 */
function Service(nodeInfo){
  this.nodeInfo = nodeInfo;
}
/*}}}*/

/*{{{ unRegisterService() */
/**
 * 注销服务
 * @param {function} callback 回调
 */
Service.prototype.unRegisterService = function(callback){
 
  del(this.nodeInfo._PATH_,function(err){
    if(err){
      callback(err);
    }else{
      callback();
    }
  });

}
/*}}}*/

/*{{{ getInfo()*/
/**
 * 获得节点信息
 * @return {object} 节点信息
 */
Service.prototype.getInfo = function(){
  return this.nodeInfo;
}
/*}}}*/

/*{{{ registerService()*/
/**
 * 注册服务
 * @param {string}    service    服务名称
 * @param {int}       version    版本号
 * @param {object}    nodeInfo   节点信息
 * @param {function}  callback   回调函数
 */
function registerService(service, version, nodeInfo, callback){
  if(!checkInfo(nodeInfo)){
    callback('node info is wrong!');
    return;
  }

  checkZk(function(err){
    if(err){
      callback(err);
      return;
    }

    var servicePath = root + formatServicePath(service);
    var versionPath = servicePath + '/version' + version.toString();
    var nodePath    = versionPath + '/' + os.hostname() + process.pid + (ran++);

    //check if exist version node
    ifExist(versionPath,function(err2,stat){
      var exist = (err2 === 'no node') ? false : true;
      
      if(!exist){
        //if not create version node
        createNode(versionPath, {}, CONSTANTS.VER_NODE_TYPE, function(err3,path){
          if(err3){
            callback(err3);
            return;
          }
          createService();
        });
      }else{
        createService();
      }

    });

    /*{{{ createService() 创建服务节点 */
    function createService(){
      nodeInfo._PATH_ = nodePath;

      createNode(nodePath, nodeInfo, CONSTANTS.REG_NODE_TYPE, function(err4,p){
        if(err4){
          callback(err4);
          return;
        }
        var obj = new Service(nodeInfo);
        callback('',obj);
        return;
      });
    }
    /*}}}*/

  });

}
exports.registerService = registerService;
/*}}}*/

/*{{{ getServiceAny()*/
/**
 * 获取任一服务
 * @param {string}           service     服务名称
 * @param {object||int}      filter      过滤规则
 * @param {function}         callback    回调函数
 * @param {function||false}  w_callback  watch节点的回调函数|false表示不注册
 */
function getServiceAny(service, filter, callback, w_callback){

  checkZk(function(err){

    var which;
    getServiceAll(service, filter
      ,function(err,data){
        if(err){
          callback(err);
          return;
        }
        which = data.useful[(data.pointer++) % data.useful.length];
        callback('',which);
      }
      ,w_callback ? function(err,data){
        if(err){
          w_callback(err);
          return;
        }

        var still = false;
        if(which !== undefined){
          for(var i in data.useful){
            if(data.useful[i]._PATH_ === which._PATH_){
              still = true;
              break;
            }
          }
        }

        if(!still && which !== undefined){
          w_callback();
        }
      }:false
    ,true);
  });
}
exports.getServiceAny = getServiceAny;
/*}}}*/

/*{{{ getServiceAll()*/
/**
 * 获取所有服务
 * @param {string}           service     服务名称
 * @param {object||int}      filter      过滤规则
 * @param {function}         callback    回调函数
 * @param {function||false}  w_callback  watch节点的回调函数|false表示不注册
 * @param {bool}             any         是否由getServiceAny调用
 */
function getServiceAll(service, filter, callback, w_callback, any){

  checkZk(function(err){

    if(connected === false){
      callback('zk is not connected');
      return;
    }

    service = root + '/' + service;

    var key = JSON.stringify({
      service : service,
      filter  : filter
    });

    //watch callback array
    if(w_callbackArr[key] === undefined){
      w_callbackArr[key] = [];
    }
    if(w_callback){
      w_callbackArr[key].push(w_callback);
    }

    //doing request array
    if(callbackArr[key] === undefined){
      callbackArr[key] = [];
      callbackArr[key].push(callback);
    }else{
      callbackArr[key].push(callback);
      return;
    }

    //if in local cache
    if(localCache[key]){
      for(var i = 0;i < callbackArr[key].length; i++){
        if(any){
          callbackArr[key][i]('',localCache[key]);
        }else{
          callbackArr[key][i]('',localCache[key].useful);
        }
      }
      delete callbackArr[key];
      return;
    }

    loadService(service, filter
      ,function(err,nodeInfos){
        if(err){
          for(var i = 0;i < callbackArr[key].length; i++){
            callbackArr[key][i](err);
          }
          delete callbackArr[key];
          return;
        }

        localCache[key] = {
          infos   : nodeInfos,
          pointer : 0,
          useful  : objectClone(nodeInfos)
        }
        localize(localCache,local);

        for(var i = 0;i < callbackArr[key].length; i++){
          if(any){
            callbackArr[key][i]('',localCache[key]);
          }else{
            callbackArr[key][i]('',localCache[key].useful);
          }
        }
        delete callbackArr[key];

        checkHBs(key,any);

      }
      ,w_callback ? function(err,nodeInfos){
        if(err){
          for(var i = 0;i < w_callbackArr[key].length; i++){
            if(w_callbackArr[key][i]){
              w_callbackArr[key][i](err);
            }
          }
          return;
        }

        if(localCache[key] === undefined){
          localCache[key] = {
            useful : objectClone(nodeInfos)
          }
        }

        localCache[key].infos = nodeInfos;
        localCache[key].pointer = 0;
        localize(localCache,local);

      } : false
    );
  });

}
exports.getServiceAll = getServiceAll;
/*}}}*/

/*{{{ loadService()*/
/**
 * 获取某节点下所有服务节点的信息
 * @param {string}           service  服务名称
 * @param {object||int}      filter   过滤规则
 * @param {function}         cb       回调函数
 * @param {function||false}  w_cb     watch节点的回调函数|false表示不注册
 */
function loadService(service, filter, cb, w_cb){
  service = formatServicePath(service);
  var signal = {
    effective : true
  }

  if(typeof filter === 'string' || (typeof filter === 'object' && typeof filter.version == 'string')){
    if(filter === CONSTANTS.RECENT || (typeof filter === 'object' && filter.version === CONSTANTS.RECENT)){
      getChildren(service
        //callback
        ,function(err,children){
          getChildrenInfo(service+'/'+getRecentVersion(children),filter,cb,w_cb,signal);
        }

        //watch callback
        ,function(err,children){
          signal.effective = false;
          loadService(service,filter,function(err,nodeInfos){
            if(err){
              w_cb(err);
            }else{
              w_cb('',nodeInfos);
            }
          },w_cb);
        },signal
      );

    }else{
      var versionPath = '';
      if(typeof filter === 'string'){
        versionPath = service + '/version' + filter;
      }else{
        versionPath = service + '/version' + filter.version
      }
      getChildrenInfo(versionPath,filter,cb,w_cb,signal);
    }

  }else if(typeof filter === 'object'){
    if(filter.version === undefined){
      cb('please tell which version');
      return;
    }
    
    var nodes = {};
    getChildren(service
      //callback
      ,function(err,children){
        var arrs = [];
        var max  = filter.version.max === undefined ? 'z' : 'version'+filter.version.max;
        var min  = filter.version.min === undefined ? 'a' : 'version'+filter.version.min;

        for(var i in children){
          if(children[i] >= min && children[i] <= max){
            arrs.push(children[i]);
          }
        }

        var count = arrs.length;
        if(count === 0){
          cb('no such services');
          return;
        }
        for(var i = 0;i < arrs.length; i++){
          (function(){
            var saveI = i;
            getChildrenInfo(service + '/' + arrs[saveI],filter
              //callback
              ,function(err,nodeInfos){

                nodes[service+'/'+arrs[saveI]] = nodeInfos;

                if(--count === 0){
                  var res = [];
                  for(var idx in nodes){
                    for(var idx2 in nodes[idx]){
                      res.push(nodes[idx][idx2]);
                    }
                  }
                  cb('',res);
                }
              }
              //watch callback
              ,w_cb ? (function(err,nodeInfos){
                if(err){
                  w_cb(err);
                  return;
                }

                nodes[service+'/'+arrs[saveI]] = nodeInfos;

                var res = [];
                for(var idx in nodes){
                  for(var idx2 in nodes[idx]){
                    res.push(nodes[idx][idx2]);
                  }
                }
                w_cb('',res);

              }):false,signal
            );
          })();
        }
      }

      //watch callback
      ,function(err,children){
        signal.effective = false;
        loadService(service,filter,function(err,nodeInfos){
          if(err){
            w_cb(err);
          }else{
            w_cb('',nodeInfos);
          }
        },w_cb);
      },signal
    );

  }else{
    cb('unsupport filter type');
  }
}
/*}}}*/

/*{{{ init()*/
/**
 * 类初始化函数
 * @param {string} addr zk的addr
 * @param {string} user 用户名
 * @param {string} pwd  密码
 */
function init(obj){
  zkInfo = {
    addr : obj.addr,
    user : obj.user,
    pwd  : obj.pwd
  }
  local = obj.localPath ? obj.localPath : './';
  root  = obj.root ? obj.root : '/service';
  checkInterval = obj.checkInterval ? obj.checkInterval : 500;
}
exports.init = init;
/*}}}*/

/*{{{ cleanCache()*/
/**
 * 清空列表缓存
 */
function cleanCache(){
  localCache = {};
}
exports.cleanCache = cleanCache;
/*}}}*/

/*{{{ zkClose()*/
/**
 * 关闭已经打开的连接
 */
function zkClose(){
  if(zk !== undefined){
    zk.close();
    zk = undefined;
  }
  for(var i = 0;i < ids.length;i++){
    clearInterval(ids[i]);
  }
}
exports.zkClose = zkClose;
/*}}}*/

/*{{{ checkZk()*/
/**
 * 初始化类静态变量zk
 * @param {function} cb 回调函数
 */
function checkZk(cb){
  if(zk === undefined){
    if(zkInfo === undefined){
      cb('call Client.init first');
      return;
    }

    zk = new ZooKeeper({
      connect : zkInfo.addr,
      timeout : CONSTANTS.TIME_OUT,
      host_order_deterministic : CONSTANTS.HOST_ORDER
    });

    zk.connect(function(err){
      if(err){
        try{
          loadFile(local);
          cb(err);
        }catch(e){
          cb('read local file wrong');
        }
        return;
      }else{
        connected = true;
        cb();
      }
    });

  }else{
    cb();
  }
}
/*}}}*/

/*{{{ getChildrenInfo()*/
/**
 * 获取节点子节点
 * @param {string}   path    节点路径
 * @param {function} filter  过滤函数
 * @param {function} cb      回调函数
 * @param {function} w_cb    watch回调函数
 * @param {object}   signal  需不需要响应回调标志
 */
function getChildrenInfo(path, filter, cb, w_cb, signal){

  var innerW_cb = function(err,children){
    if(err){
      w_cb(err);
      return;
    }

    getChildrenInfo(path,filter,function(err3,children2){
      if(err3){
        w_cb(err3);
        return;
      }
      w_cb('',children2);
    },w_cb,signal);
  }


  if(w_cb === false){
    innerW_cb = undefined;
  }

  getChildren(path
    ,function(err,children){
      if(err){
        cb(err);
        return;
      }

      var nodeInfos = [];
      var count     = children.length;
      if(count === 0){
        cb('',children);
        return;
      }

      for(var i in children){
        get(path + '/' + children[i], function(err2,data){
          if(err2){
            cb(err2);
            return;
          }

          data = filterFunc(JSON.parse(data.toString()),filter);
          if(data){
            nodeInfos.push(data);
          }

          if(--count === 0){
            cb('',nodeInfos);
          }
        });
      }
    },innerW_cb, signal
  );

}
/*}}}*/

/*{{{ checkHBs()*/
function checkHBs(key,any){
  var id = setInterval(function(){
    checkGroupUse(localCache[key].infos,function(nodes){

      var change = false;
      if(localCache[key].useful.length !== nodes.length){
        localCache[key].useful = objectClone(nodes);
        change = true;

      }else{
        for(var i = 0;i < nodes.length; i++){
          var exist = false;
          for(var j = 0;j < localCache[key].useful.length;j++){
            if(nodes[i]._PATH_ === localCache[key].useful[j]._PATH_){
              exist = true;
              break;
            }
          }
          if(!exist){
            change = true;
            localCache[key].useful = objectClone(nodes);
            break;
          }
        }
      }

      if(change){
        for(var i = 0;i < w_callbackArr[key].length; i++){
          if(w_callbackArr[key][i]){
            if(any){
              w_callbackArr[key][i]('',localCache[key]);
            }else{
              w_callbackArr[key][i]('',localCache[key].useful);
            }
          }
        }
      }
    });

  },checkInterval);
  ids.push(id);
}
/*}}}*/

/*{{{ checkGroupUse()*/
/**
 * 检查一组节点信息返回可用
 * @param {array}    infos 一组节点信息
 * @param {function} cb    回调函数
 */
function checkGroupUse(infos,cb){
  var useful = [];
  var err;

  var count = infos.length;
  if(count === 0){
    cb(useful);
    return;
  }
  for(var i = 0;i < infos.length; i++){
    (function(){
      var saveI = i;
      checkUse(infos[saveI].url,function(err){
        if(err){
        }else{
          useful.push(infos[saveI]);
        }
        if(--count === 0){
          cb(useful);
        }
      });
    })();
  }
}
/*}}}*/

/*{{{ checkUse()*/
/**
 * 检查地址是否可用
 * @param {string}   addr 地址
 * @param {function} cb   回调函数
 */
function checkUse(addr,cb){
  var id;
  var process = exec('curl '+addr,function(err,stdout,stderr){
    clearTimeout(id);
    if(err){
      cb('service is unavailable');
    }else{
      cb();
    }
  });
  id = setTimeout(function(){
    process.kill();
  },checkTm);
}
/*}}}*/

/*{{{ checkInfo()*/
/**
 * 检查注册的服务对象是否符合要求
 * @param {object} obj 检查对象
 * @param {boolean} 是否符合
 */
function checkInfo(obj){
  if(obj.url === undefined){return false;}
  if(obj.method === undefined){return false;}
  if(obj.room === undefined){return false;}
  return true;
}
/*}}}*/

/*{{{ localize()*/
/**
 * 本地化
 * @param {object} obj 对象
 *
 */
function localize(obj,path){
  fs.writeFileSync(path + '/' + fileName,JSON.stringify(obj));
}
/*}}}*/

/*{{{ loadFile()*/
/**
 * 载入本地文件
 * @param {string} path 文件路径
 */
function loadFile(path){
  localCache = JSON.parse(fs.readFileSync(path + '/' + fileName));
}
/*}}}*/

/*{{{ getRecentVersion()*/
/**
 * 获取最新版本名字
 * @param {array} nodes 节点数组
 * @return {string} 最新节点名字
 */
function getRecentVersion(nodes){
  var recent = '';
  for(var i in nodes){
    if(nodes[i] > recent){
      recent = nodes[i];
    }
  }
  return recent;
}
/*}}}*/

/*{{{ formatServicePath()*/
/**
 * 获取服务路径
 * @param  {string} service 服务
 * @return {string} 服务路径
 */
function formatServicePath(service, version){
  if(service.charAt(service.length-1) === '/'){
    service = service.substr(0,service.length-1);
  }
  if(service.charAt(0) !== '/'){
    service = '/' + service;
  }
  return service; 
}
/*}}}*/

/*{{{ filterFunc()*/
/**
 * 条件过滤函数
 * @param {object} obj    节点信息
 * @param {object} filter 节点过滤信息
 * @return {object || ''} 如果不在过滤条件里，则返回原对象，否则返回空
 */
function filterFunc(obj,filter){
  if(typeof filter === 'object' && filter.room !== undefined && obj.room !== filter.room){
    return '';
  }else{
    return obj;
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
function createNode(path,obj,type,cb){
  zk.a_create(path,JSON.stringify(obj),type,function(rc,error,path){
    if(rc != 0){
      cb(error);
    }else{
      cb('',path);
    }
  });
}
/*}}}*/

/*{{{ ifExist()*/
/**
 * 判断节点是否存在
 * @param {string}   path  节点路径
 * @param {function} cb    回调函数
 * @param {function} w_cb  watch回调函数
 */
function ifExist(path,cb,w_cb){
  if(w_cb === undefined){
    zk.a_exists(path,false,function(rc,error,stat){
      if(rc != 0){
        cb(error);
      }else{
        cb('');
      }
    });
  }else{
    zk.aw_exists(path
      ,innerW_cb
      ,function(rc,error){
        if(rc != 0){
          cb(error);
        }else{
          cb('');
        }
      }
    );

    function innerW_cb(type,state,rePath){
      if(type === ZooKeeper.ZOO_SESSION_EVENT){
        if(state === ZooKeeper.ZOO_CONNECTING_STATE){
          connected = false;
        }else if(state === ZooKeeper.ZOO_CONNECTED_STATE){
          connected = true;
        }
      }else{
        zk.aw_exists(path,innerW_cb,function(rc,error,stat){
          if(rc != 0){
            w_cb(error);
          }else{
            w_cb();
          }
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
function getChildren(path,cb,w_cb,signal){
  if(w_cb === undefined){
    zk.a_get_children(path,false,function(rc,error,children){
      if(rc != 0){
        cb(error);
      }else{
        cb('',children);
      }
    });

  }else{
    zk.aw_get_children(path
      ,innerW_cb
      ,function(rc,error,children){
        if(rc != 0){
          cb(error);
        }else{
          cb('',children);
        }
      }
    );

    function innerW_cb(type,state,rePath){
      if(signal && !signal.effective){return;}
      if(type === ZooKeeper.ZOO_SESSION_EVENT){
        if(state === ZooKeeper.ZOO_CONNECTING_STATE){
          connected = false;
        }else if(state === ZooKeeper.ZOO_CONNECTED_STATE){
          connected = true;
        }
      }else{
        zk.aw_get_children(path,innerW_cb,function(rc,error,children){
          if(rc != 0){
            w_cb(error);
          }else{
            w_cb('',children);
          }
        });
      }
    }

  }
}
/*}}}*/

/*{{{ get()*/
/**
 * 获取节点保存的value
 * @param {string}   path  节点路径
 * @param {function} cb    回调函数
 * @param {function} w_cb  watch回调函数
 */
function get(path,cb,w_cb){
  if(w_cb === undefined){
    zk.a_get(path,false,function(rc,error,stat,data){
      if(rc != 0){
        cb(error);
      }else{
        cb('',data);
      }
    });

  }else{
    zk.aw_get(path
      ,innerW_cb
      ,function(rc,error,stat,data){
        if(rc != 0){
          cb(error);
        }else{
          cb('',data);
        }
      }
    );
    
    function innerW_cb(type,state,rePath){
      if(type === ZooKeeper.ZOO_SESSION_EVENT){
        if(state === ZooKeeper.ZOO_CONNECTING_STATE){
          connected = false;
        }else if(state === ZooKeeper.ZOO_CONNECTED_STATE){
          connected = true;
        }
      }else{
        zk.aw_get(path,innerW_cb,function(rc,error,stat,data){
          if(rc != 0){
            w_cb(error);
          }else{
            w_cb();
          }
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
function set(path,obj,cb){
  zk.a_set(path,JSON.stringify(obj),CONSTANTS.SET_VERSION
    ,function(rc,error,stat){
      if(rc != 0){
        cb(error);
      }else{
        cb('',stat);
      }
    }
  );
}
/*}}}*/

/*{{{ del()*/
/**
 * 删除节点
 * @param {string}   path 节点路径
 * @param {function} cb   回调函数
 */
function del(path,cb){
  zk.a_delete_(path,CONSTANTS.DEL_VERSION,function(rc,error){
    if(rc != 0){
      cb(error);
    }else{
      cb();
    }
  });
}
/*}}}*/

/*{{{ objectClone()*/
/**
 * 对象复制
 * @param {object} obj 对象
 * @param {string} preventName 屏蔽的名字
 * @param {object} 复制出的对象
 */
function objectClone(obj,preventName){ 
  if((typeof obj) === 'object' && obj !== null){ 
    var res = (!obj.sort)?{}:[]; 
    for(var i in obj){ 
      if(i != preventName) 
        res[i] = objectClone(obj[i],preventName); 
    } 
    return res; 
  }else if((typeof obj) === 'function'){ 
    return (new obj()).constructor; 
  } 
  return obj; 
}
/*}}}*/

