/* vim: set expandtab tabstop=2 shiftwidth=2 foldmethod=marker: */

var os     = require('os');
var fs     = require('fs');
var exec   = require('child_process').exec;
var events = require('events');
var util   = require('util');

var ZooKeeper = require('zookeeper');

var CONSTANTS = require('./CONSTANTS');
var zkTools   = require('./zkTool');
var MyError   = require('./error');

var zk          = undefined;
var config      = {};

var serviceId = 0;
var serviceMap = [];
var cache = {}

exports.createClient = function(options){

  if(zk !== undefined){
    return false;
  }

  var _me = {};

  /*{{{ registerService() */
  /**
   * 注册服务
   * @access public
   * @param {String} name       : service name, e.g. service1
   * @param {String} version    : service version, e.g. 1.0
   * @param {String|Object} addr: service address, anything you want
   * @param {Object} meta       : 
   * @param {Function} callback
   */
  _me.registerService = function(name, version, addr, meta, callback){
    meta = meta || {
      weigth : 1
    }

    var info = {
      meta : meta,
      addr : addr
    }

    var vers = '/' + CONSTANTS.SERVICE_ROOT + '/' + name + '/' + version;
    var node = vers + '/' + os.hostname() + process.pid;
    serviceId++;
    serviceMap[serviceId] = node;

    checkZK(function(err){
      if(err){
        callback(err);
        return;
      }

      zkTools.ifExist(vers, function(err2){
        var exist = (err2) ? false : true;

        if(!exist){
          //create version node
          zkTools.createNode(vers, {}, CONSTANTS.VER_NODE_TYPE, function(err3,path){
            if(err3){
              callback(err3);
              return;
            }
            createService(node, info, callback);
          });
        }else{
          createService(node, info, callback);
        }
      });

    });

    return serviceId; 
  };
  /*}}}*/

  /*{{{ unRegisterService() */
  /**
   * 注销服务
   * @param {Object} id
   * @param {Function} callback
   */
  _me.unRegisterService = function(id,callback){
    zkTools.del(serviceMap[id],function(err){
      if(err){
        callback(err);
      }else{
        serviceNode = undefined;
        callback(null);
      }
    });
  };
  /*}}}*/

  /*{{{ subscribe() */
  /**
   * 订阅服务
   * @param {String} name          : service name e.g. service1
   * @param {String|Object} filter : filter for service e.g. '1.0' or {version:{min:'1.0'}}
   * @param {Function} callback    
   */
  _me.subscribe = function(name,filter,callback){
    var key = JSON.stringify({
      name : name,
      filter : filter
    });

    var service = new Service();

    loadService(key,name,filter,service,function(err2){
      if(err2 && err2.name === 'CONNECT_ERROR'){
        loadCache(config.cachepath);
        var list = cache[key] ? [cache[key]] : [];
        service.setList(key,list);
        service.setOK();
        callback();

      }else if(err2){
        callback(err2);
      }else{
        service.setOK();
        callback();
      }
    });
    return service;

  };
  /*}}}*/

  /*{{{ unsubscribe() */
  /**
   * 取消订阅
   * @param {String} name       : service name e.g. service1
   * @param {Function} callback
   */
  _me.unsubscribe = function(name,callback){
  
  };
  /*}}}*/

  /*{{{ recover()*/
  /**
   * 回复客户端zk
   */
  _me.recover = function(){
    if(zk !== undefined){
      zk.close();
    }
    zk = undefined;
    serviceNode = undefined;
  }
  /*}}}*/

  /*{{{ setConfig()*/
  /**
   * 设置客户端信息
   * @param {Object} opts 信息对象
   */
  _me.setConfig = function(opts){
    config = {
      'zookeeper' : opts.zookeeper,
      'username'  : opts.username,
      'password'  : opts.password,
      'cachepath' : (opts.cachepath) ? opts.cachepath : CONSTANTS.DEFAULT_PATH,
    }
  }
  /*}}}*/

  _me.setConfig(options);

  return _me;

}

/*{{{ Service constructor */
/**
 * Service对象构造函数
 */
function Service(){
  this.list = [];
  this.available = [];
  this.pointer = 0;
  this.ok = false;
}
util.inherits(Service,events.EventEmitter);
/*}}}*/

/*{{{ Service.prototype.setList() */
/**
 * 设置service对象的服务列表
 * @param {String} key 键
 * @param {Array} list 列表
 */
Service.prototype.setList = function(key,list){
  this.list = [];
  this.available = [];
  for(var i in list){
    for(var j = 0;j < list[i].length; j++){
      this.list.push(objectClone(list[i][j]));
      this.available.push(list[i][j].addr);
    }
  }
  var tmp = objectClone(cache);
  tmp[key] = this.list;
  writeCache(config.cachepath+process.pid,JSON.stringify(tmp));
  cache = objectClone(tmp);
}
/*}}}*/

/*{{{ Service.prototype.getServiceAll() */
/**
 * 获取可用服务列表
 * @return {Array} 
 */
Service.prototype.getServiceAll = function(){
  return objectClone(this.available);
}
/*}}}*/

/*{{{ Service.prototype.getServiceAny() */
/**
 * 获取服务列表中的一个服务
 * @return {String}
 */
Service.prototype.getServiceAny = function(){
  return this.list[(this.pointer++)%this.list.length].addr;
}
/*}}}*/

/*{{{ Service.prototype.heartbeat() */
/**
 * 心跳设置
 * @param {Function} func 心跳方法
 * @param {int} interval 心跳时间间隔
 */
Service.prototype.heartbeat = function(func,interval){
  var _self = this;
  setInterval(function(){
    if(!_self.ok){return;}
    var tmp   = [];
    var count = _self.list.length;
    var preAvail = _self.getServiceAll();

    if(func === 'default'){
      func = defaultHB;
    }
    _self.list.forEach(function(one){
      func(one.addr,function(err){
        if(!err){
          tmp.push(one.addr);
        }
        if(--count === 0){
          if(isDiff(_self.available,preAvail)){
            return;
          }
          if(isDiff(_self.available,tmp)){
            _self.available = objectClone(tmp);
            _self.emit('update',_self.getServiceAll());
          }
        }
      });
    });
  },interval);
}
/*}}}*/

/*{{{ Service.prototype.setOK()*/
/**
 * 心跳开关
 */
Service.prototype.setOK = function(){
  this.ok = true;
}
/*}}}*/

/*{{{ checkZK() */
/**
 * 检查zk是否初始化
 * @param {Function} callback
 */
function checkZK(callback){
  if(zk !== undefined){
    callback();
    return;
  }

  zk = new ZooKeeper({
    connect : config.zookeeper,
    timeout : CONSTANTS.DEFAULT_TM,
    host_order_deterministic : CONSTANTS.HOST_ORDER
  });

  zk.connect(function(err){
    if(err){
      callback(new MyError('CONNECT_ERROR',err));
    }else{
      zkTools.init(zk);
      callback();
    }
  });
}
/*}}}*/

/*{{{ createService() */
/**
 * 创建服务节点
 * @param {String} node 服务节点名
 * @param {String} info 节点保存信息
 * @param {Function} callback
 */
function createService(node,info,callback){
  info._PATH_ = node;
  zkTools.createNode(node, info, CONSTANTS.REG_NODE_TYPE, function(err,path){
    if(err){
      callback(err);
      return;
    }else{
      serviceNode = node;
      callback();
    }
  });
}
/*}}}*/

/*{{{ loadService()*/
/**
 * 搜索服务
 * @param {String} key 全局键
 * @param {String} name 服务名
 * @param {Object} filter 筛选条件
 * @param {Object} service 服务对象
 * @param {Function} callback 
 */
function loadService(key,name,filter,service,callback){
  checkZK(function(err){
    if(err){
      callback(err);
      return;
    }

    var serviceName = '/' + CONSTANTS.SERVICE_ROOT + '/' + name;
    var sign = {
      call:true
    };

    zkTools.getChildren(serviceName,function(err,children){
      children = filterNodes(children,filter);
      if(children === false){
        callback(new MyError('FILTER_WRONG','filter is wrong'));
        sign.call = false;
        return;
      }

      var nodesInfo = {};
      var count = children.length;
      if(count === 0){
        service.setList(key,nodesInfo);
        callback();
        return;
      }
      children.forEach(function(child){
        getChildInfo(serviceName+'/'+child,sign,filter,function(err2,info){
          if(err2){
            callback(err2);
            return;
          }
          nodesInfo[child] = info;

          if(--count === 0){
            service.setList(key,nodesInfo);
            callback();
          }
          //emit event
        },function(err,info){
          nodesInfo[child] = info;
          var preAvail = service.getServiceAll();
          service.setList(key,nodesInfo);
          if(isDiff(preAvail,service.getServiceAll())){
            //nodeInfos需要筛选字段
            service.emit('update',service.getServiceAll());
          }
        });
      });

    },function(err,children){
      sign.call = false;
      var preAvail = service.getServiceAll();
      loadService(key,name,filter,service,function(err){
        if(err){return;}
        if(isDiff(preAvail,service.getServiceAll())){
          service.emit('update',service.getServiceAll());
        }
      });
    },sign);
  });

}
/*}}}*/

/*{{{ getChildInfo()*/
/**
 * 获取子节点信息
 */
function getChildInfo(child,sign,filter,callback,w_callback){

  var innerW_b = function(err,children){
    getChildInfo(child,sign,filter,function(err,infos){
      w_callback(err,infos);
    },false);
  }

  var cbFunc = w_callback ? innerW_b : undefined;

  zkTools.getChildren(child,function(err,children){
    if(err){
      callback(err);
      return;
    }
    var infos = [];
    var count = children.length;

    if(count === 0){
      callback(null,infos);
      return;
    }
    children.forEach(function(c){
      zkTools.get(child+'/'+c,function(err2,data){
        if(err2){
          callback(err2);
          return;
        }

        data = checkNode(data,filter);
        if(data){
          infos.push(data);
        }

        if(--count === 0){
          callback(null,infos);
        }
      });
    });

  },cbFunc,sign);
}
/*}}}*/

/*{{{ filterNodes() */
/**
 * 根据删选条件，枚举版本节点
 * @param {Array} children 所有版本节点
 * @param {Object} filter 筛选条件
 * @return {Array|boolean}具体版本或者版本列表或者错误false
 */
function filterNodes(children,filter){
  if(typeof filter === 'string'){
    return findVersion(children,filter);

  }else if(typeof filter === 'object'){
    if(filter.version === undefined){
      return findVersion(children,CONSTANTS.RECENT);

    }else if(typeof filter.version === 'string'){
      return findVersion(children,filter.version);

    }else if(typeof filter.version === 'object'){
      var max = (filter.version.max) ? (filter.version.max) : 'z';
      var min = (filter.version.min) ? (filter.version.min) : '';
      var res = [];
      
      for(var i = 0;i < children.length; i++){
        if(children[i] >= min && children[i] <= max){
          res.push(children[i]);
        }
      }
      return res;
    
    }else{
      return false;
    }

  }else{
    return false;
  }
}
/*}}}*/

/*{{{ checkNode()*/
/**
 * 检查节点是否符合条件
 * @param {String} data 结果
 * @param {Object} filter 筛选条件
 * @return {Object|boolean} 结果集或者错误false
 */
function checkNode(data,filter){
  data = JSON.parse(data);
  if(filter.room !== undefined){
    if(data.meta.room !== filter.room){
      return false;
    }
    return data;
  }else{
    return data;
  }
}
/*}}}*/

/*{{{ findVersion() */
/**
 * 得到具体版本
 * @param {Array} children 版本列表
 * @param {String} 具体某个版本
 * @return {String|boolean} 所找到版本名或者返回false
 */
function findVersion(children,version){
  var res = [];
  if(version === CONSTANTS.RECENT){
    var m = max(children);
    if(m !== ''){
      res.push(m);
    }
    return res;
  }else{
    if(exist(children,version)){
      res.push(version);
    }
    return res;
  }
}
/*}}}*/

/*{{{ writeCache()*/
/**
 * 写本地文件
 * @param {String} path 路径
 * @param {String} content 内容
 */
function writeCache(path,content){
  fs.writeFileSync(path,content);
}
/*}}}*/

/*{{{ loadCache()*/
/**
 * 加载本地文件
 * @param {String} path 路径
 */
function loadCache(path){
  cache = {};
  var splits = path.split('/');
  var prefix = splits.pop();
  var dir    = splits.join('/');
  var files  = fs.readdirSync(dir);

  var cacheMap = {};
  var pattern = new RegExp('^'+prefix,'i');
  for(var i = 0;i < files.length;i++){
    if(pattern.test(files[i])){
      var get = JSON.parse(fs.readFileSync(dir+'/'+files[i]));
      for(var j in get){
        if(cacheMap[j] === undefined){
          cacheMap[j] = [];
        }
        cacheMap[j].push(get[j]);
      }
    }
  }

  for(var i in cacheMap){
    var arr = cacheMap[i];
    var res = [];
    for(var j = 0;j < arr.length; j++){
      for(var l = 0;l < arr[j].length;l++){

        var exist = false;
        for(var k in res){
          if(res[k].addr === arr[j][l].addr){
            exist = true;
          }
        }
        if(!exist){
          res.push(arr[j][l]);
        }

      }
    }
    cache[i] = res;
  }
}
/*}}}*/

/*{{{ defaultHB()*/
/**
 * 默认心跳方法
 * @param {String} addr 要检查的服务路径
 * @param {Function} cb 回调函数
 */
function defaultHB(addr,cb){
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

/*{{{ max() */
/**
 * 取最大值
 * @param {Array} elements 数组
 */
function max(elements){
  var m = '';
  for(var i in elements){
    if(elements[i] > m){
      m = elements[i];
    }
  }
  return m;
}
/*}}}*/

/*{{{ isDiff() */
/**
 * 判断两个数列是否一样
 * @param {Array} list1 数列1
 * @param {Array} list2 数列2
 * @return {boolean} 是否一样
 */
function isDiff(list1,list2){
  if(list1.length !== list2.length){
    return true;
  }
  for(var i = 0;i < list1.length; i++){
    var exist = false;
    for(var j = 0;j < list2.length; j++){
      if(list1[i] === list2[j]){
        exist = true;
      }
    }
    if(!exist){
      return true;
    }
  }
  return false;
}
/*}}}*/

/*{{{ exist()*/
/**
 * 判断列表中是否存在某个元素
 * @param {Array} list 列表
 * @param {Unknown} one 元素
 * @return {boolean} 是否存在
 */
function exist(list,one){
  for(var i in list){
    if(list[i] === one){
      return true;
    }
  }
  return false;
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
