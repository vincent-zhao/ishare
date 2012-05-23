/* vim: set expandtab tabstop=2 shiftwidth=2 foldmethod=marker: */

var os   = require('os');
var fs   = require('fs');
var exec = require('child_process').exec;

var ZooKeeper = require('zookeeper');

var CONSTANTS = require('./CONSTANTS');
var zkTools   = require('./zkTool');

/*{{{ settings*/
var settings = {
  addr : '',
  user : '',
  pwd : '',
  root : '/service',
  localPath : __dirname + '/.cache',
  checkInterval: 500,
}
/*}}}*/

//for test
var ran = 0;

/*{{{ 容器*/
//本地缓存
var localCache = {};
//回调函数队列，用来处理并发的相同请求
var callbackArr = {};
//watch函数（监听函数）队列
var w_callbackArr = {};
//定时器id数组
var ids = [];
//所有zk对象
var zks = [];
//hb函数map
var hbFuncArr = {};
/*}}}*/

/*{{{ service constructor*/
/**
 * 客户端对象构造函数
 * @param {string} path     服务节点路径
 * @param {object} zk       zk对象
 * @param {object} nodeInfo 节点信息
 */
function Service(nodeInfo,zk){
  this.zk = zk;
  this.nodeInfo = nodeInfo;
}
/*}}}*/

/*{{{ unRegisterService() */
/**
 * 注销服务
 * @param {function} callback 回调
 */
Service.prototype.unRegisterService = function(callback){
 
  var self = this;
  zkTools.del(self.zk,this.nodeInfo._PATH_,function(err){
    if(err){
      callback(err);
    }else{
      callback();
      self.zk.close();
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
 * @param {string}    service     服务名称
 * @param {int}       version     版本号
 * @param {object}    ctlInfo 和zk会话信息
 * @param {object}    nodeInfo    节点信息
 * @param {function}  callback    回调函数
 */
function registerService(service, version, ctlInfo, nodeInfo, callback){
  if(!checkInfo(nodeInfo)){
    callback('node info is wrong!');
    return;
  }

  createZK(ctlInfo.tm,function(err,zk){
    if(err){
      callback(err);
      return;
    }

    var servicePath = settings.root + formatServicePath(service);
    var versionPath = servicePath + '/version' + version.toString();
    var nodePath    = versionPath + '/' + os.hostname() + process.pid + (ran++);

    //check if exist version node
    zkTools.ifExist(zk, versionPath,function(err2,stat){
      var exist = (err2 === 'no node') ? false : true;
      
      if(!exist){
        //if not create version node
        zkTools.createNode(zk, versionPath, {}, CONSTANTS.VER_NODE_TYPE, function(err3,path){
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

      zkTools.createNode(zk, nodePath, nodeInfo, CONSTANTS.REG_NODE_TYPE, function(err4,p){
        if(err4){
          callback(err4);
          return;
        }
        var obj = new Service(nodeInfo,zk);
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
 * @param {object}           ctlInfo 和zk会话信息
 * @param {function}         callback    回调函数
 * @param {function||false}  w_callback  watch节点的回调函数|false表示不注册
 */
function getServiceAny(service, filter, ctlInfo, callback, w_callback){

  var which;
  getServiceAll(service, filter, ctlInfo
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
}
exports.getServiceAny = getServiceAny;
/*}}}*/

/*{{{ getServiceAll()*/
/**
 * 获取所有服务
 * @param {string}           service     服务名称
 * @param {object||int}      filter      过滤规则
 * @param {object}           ctlInfo 和zk会话信息
 * @param {function}         callback    回调函数
 * @param {function||false}  w_callback  watch节点的回调函数|false表示不注册
 * @param {bool}             any         是否由getServiceAny调用
 */
function getServiceAll(service, filter, ctlInfo, callback, w_callback, any){
  service = settings.root + '/' + service;

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
    if(any){
      callFunc(callbackArr,key,['',localCache[key]],false);
    }else{
      callFunc(callbackArr,key,['',localCache[key].useful],false);
    }
    delete callbackArr[key];
    return;
  }

  createZK(ctlInfo.tm,function(err,zk){
    if(err){
      if(localCache[key] !== undefined){
        if(any){
          callFunc(callbackArr,key,['',localCache[key]],false);
        }else{
          callFunc(callbackArr,key,['',localCache[key].useful],false);
        }
      }else{
        callFunc(callbackArr,key,[err],false);
      }
      delete callbackArr[key];
      delete w_callbackArr[key];
      return;
    }

    loadService(zk, service, filter
      ,function(err,nodeInfos){
        if(err){
          callFunc(callbackArr,key,[err],false);
          delete callbackArr[key];
          return;
        }

        localCache[key] = {
          infos   : nodeInfos,
          pointer : 0,
          useful  : objectClone(nodeInfos)
        }
        localize(localCache,settings.localPath);

        if(any){
          callFunc(callbackArr,key,['',localCache[key]],false);
        }else{
          callFunc(callbackArr,key,['',localCache[key].useful],false);
        }
        delete callbackArr[key];

        hbFuncArr[key] = hbFuncArr[key] === undefined ? ctlInfo.hbFunc : hbFuncArr[key];
        checkHBs(key,any);

      }
      ,w_callback ? function(err,nodeInfos){
        if(err){
          w_callbackArr[key] = callFunc(w_callbackArr,key,[err],true);
          return;
        }

        localCache[key].infos   = nodeInfos;
        localCache[key].pointer = 0;
        localize(localCache,settings.localPath);

      } : false
    );
  });

}
exports.getServiceAll = getServiceAll;
/*}}}*/

/*{{{ loadService()*/
/**
 * 获取某节点下所有服务节点的信息
 * @param {object}           zk       zk对象
 * @param {string}           service  服务名称
 * @param {object||int}      filter   过滤规则
 * @param {function}         cb       回调函数
 * @param {function||false}  w_cb     watch节点的回调函数|false表示不注册
 */
function loadService(zk, service, filter, cb, w_cb){
  service = formatServicePath(service);
  var signal = {
    effective : true
  }

  if(typeof filter === 'string' || (typeof filter === 'object' && typeof filter.version == 'string')){
    if(filter === CONSTANTS.RECENT || (typeof filter === 'object' && filter.version === CONSTANTS.RECENT)){
      zkTools.getChildren(zk,service
        //callback
        ,function(err,children){
          getChildrenInfo(zk,service+'/'+getRecentVersion(children),filter,cb,w_cb,signal);
        }

        //watch callback
        ,function(err,children){
          signal.effective = false;
          loadService(zk,service,filter,function(err,nodeInfos){
            err ? w_cb(err) : w_cb('',nodeInfos);
          },w_cb);
        },signal
      );

    }else{
      var versionPath = service + '/version' + (typeof filter === 'string' ? filter : filter.version);
      getChildrenInfo(zk,versionPath,filter,cb,w_cb,signal);
    }

  }else if(typeof filter === 'object'){
    if(filter.version === undefined){
      cb('please tell which version');
      return;
    }
    
    var nodes = {};
    zkTools.getChildren(zk,service
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
            getChildrenInfo(zk,service + '/' + arrs[saveI],filter
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
        loadService(zk,service,filter,function(err,nodeInfos){
          err ? w_cb(err) : w_cb('',nodeInfos);
        },w_cb);
      },signal
    );

  }else{
    cb('unsupport filter type');
  }
}
/*}}}*/

/*{{{ getChildrenInfo()*/
/**
 * 获取节点子节点
 * @param {object}   zk       zk对象
 * @param {string}   path    节点路径
 * @param {function} filter  过滤函数
 * @param {function} cb      回调函数
 * @param {function} w_cb    watch回调函数
 * @param {object}   signal  需不需要响应回调标志
 */
function getChildrenInfo(zk, path, filter, cb, w_cb, signal){

  var innerW_cb = function(err,children){
    if(err){
      w_cb(err);
      return;
    }

    getChildrenInfo(zk,path,filter,function(err3,children2){
      if(err3){
        w_cb(err3);
        return;
      }
      w_cb('',children2);
    },w_cb,signal);
  }

  innerW_cb = (w_cb === false) ? undefined : innerW_cb;

  zkTools.getChildren(zk,path
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
        zkTools.get(zk,path + '/' + children[i], function(err2,data){
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

/*{{{ init()*/
/**
 * 类初始化函数
 * @param {object} obj 初始化信息
 */
function init(obj){
  settings.addr = obj.addr;
  settings.user = obj.user;
  settings.pwd  = obj.pwd;
  
  if(obj.localPath){settings.localPath = obj.localPath;}
  if(obj.root){settings.root = obj.root;}
  if(obj.checkInterval){settings.checkInterval = obj.checkInterval;}

}
exports.init = init;
/*}}}*/

/*{{{ cleanCache()*/
/**
 * 清空列表缓存
 */
function cleanCache(){
  localCache    = {};
  w_callbackArr = {};
  hbFuncArr     = {};
}
exports.cleanCache = cleanCache;
/*}}}*/

/*{{{ zkClose()*/
/**
 * 关闭已经打开的连接
 */
function zkClose(){
  for(var i = 0;i<zks.length;i++){
    zks[i].close();
  }
  for(var i = 0;i < ids.length;i++){
    clearInterval(ids[i]);
  }
}
exports.zkClose = zkClose;
/*}}}*/

/*{{{ checkHBs()*/
function checkHBs(key,any){
  var id = setInterval(function(){
    if(localCache[key] === undefined){return;}
    checkGroupUse(key,function(nodes){

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

      if(!change){return;}
      if(any){
        w_callbackArr[key] = callFunc(w_callbackArr,key,['',localCache[key]],true);
      }else{
        w_callbackArr[key] = callFunc(w_callbackArr,key,['',localCache[key].useful],true);
      }
    });

  },settings.checkInterval);
  ids.push(id);
}
/*}}}*/

/*{{{ checkGroupUse()*/
/**
 * 检查一组节点信息返回可用
 * @param {array}    infos 一组节点信息
 * @param {function} cb    回调函数
 */
function checkGroupUse(key,cb){
  var useful = [];
  var err;

  var infos = localCache[key].infos;
  var count = infos.length;
  if(count === 0){
    cb(useful);
    return;
  }

  var hbFunc = hbFuncArr[key] ? hbFuncArr[key] : checkUse;
  for(var i = 0;i < infos.length; i++){
    (function(){
      var saveI = i;
      hbFunc(infos[saveI].url,function(err){
        if(!err){
          useful.push(infos[saveI]);
        }
        (--count === 0) ? cb(useful) : '';
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
    err ? cb('service is unavailable') : cb();
  });

  id = setTimeout(function(){
    process.kill();
  },CONSTANTS.CHECK_TM);
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
  return true;
}
/*}}}*/

/*{{{ localize()*/
/**
 * 本地化
 * @param {object} obj 对象
 * @param {String} path 路径
 */
function localize(obj,path){
  fs.writeFileSync(path,JSON.stringify(obj));
}
/*}}}*/

/*{{{ loadFile()*/
/**
 * 载入本地文件
 * @param {string} path 文件路径
 */
function loadFile(path){
  localCache = JSON.parse(fs.readFileSync(path));
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
    recent = (nodes[i] > recent) ? nodes[i] : recent;
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

/*{{{ createZK()*/
/**
 * 创建zk实例
 * @param {int} timeout 超时
 * @param {function} cb 回调函数
 */
function createZK(tm,cb){
  if(!settings.addr){
    cb('call init function first!');
    return;
  }
  var zk = new ZooKeeper({
    connect : settings.addr,
    timeout : tm,
    host_order_deterministic : CONSTANTS.HOST_ORDER
  });

  zk.connect(function(err){
    if(err){
      try{
        loadFile(settings.localPath);
        cb(err);
      }catch(e){
        cb('read local file wrong');
      }
      return;
    }else{
      zks.push(zk);
      cb('',zk);
    }
  });
}
/*}}}*/

/*{{{ callFunc()*/
/**
 * 逐一回调队列里的方法
 * @param {object}  func    函数map
 * @param {string}  key     指定某个key下的函数队列
 * @param {object}  content 返回的内容
 * @param {boolean} remain  是否维护函数队列
 */
function callFunc(func,key,content,remain){
  var save = [];
  while(func[key] !== undefined && func[key].length !== 0){
    var cb = func[key].pop();
    if(remain){save.push(cb);}
    if(cb){
      cb(content[0],content[1]);
    }
  }
  return save;
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

