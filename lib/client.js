/* vim: set expandtab tabstop=2 shiftwidth=2 foldmethod=marker: */
/**
 * 客户端主文件
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */

var os     = require('os');
var util   = require('util');
var Event  = require('events').EventEmitter;

var ZooKeeper = require('zookeeper');

var CONSTANTS   = require('./CONSTANTS');
var zkTools     = require('./zkTool');
var tools       = require('./tools');
var MyError     = require('./classes/Error');
var ResultGroup = require('./classes/ResultGroup');
var Service     = require('./classes/Service');
var Cache       = require('./classes/Cache');

/*{{{ static variables*/
var cache       = Cache.getCacheObject();

//zk对象
var zk          = undefined;
//zk对象状态
var zkStat      = CONSTANTS.ZK_NOT_OK;
//zk连接时的请求缓冲队列
var zkQueue     = [];

var config      = {};

//提供的服务（唯一）
var serviceNode;
//注册的service id
var serviceId   = 0;
//id对应的map
var serviceMap  = [];
//所有订阅的service组成的数组
var serviceArr  = [];

var operMap     = {}
/*}}}*/

exports.createClient = function(options){

  if (zk !== undefined) {
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
  _me.registerService = function (name, version, addr, meta, callback) {
    meta = meta || {
      weigth : 1
    }

    var info = {
      meta : meta,
      addr : addr
    }

    var vers = '/' + CONSTANTS.SERVICE_ROOT + '/' + name + '/' + version;
    var node = vers + '/' + os.hostname() + process.pid;
    serviceId ++;
    serviceMap[serviceId] = node;

    var checkEvent = new Event();
    
    checkEvent.on('err', function (err) {
      callback(err);
      return;
    });

    checkEvent.on('ok', function () {
      var existEvent = zkTools.ifExist(vers);

      existEvent.on('err', function (err) {
        var createEvent = zkTools.createNode(vers, {}, CONSTANTS.VER_NODE_TYPE);

        createEvent.on('err', function (err_2) {
          callback(err_2);
          return;
        });

        createEvent.on('ok', function (path) {
          createService(node, info, callback);
        });

      });

      existEvent.on('ok', function () {
        createService(node, info, callback);
      });

    });
    checkZK(checkEvent);

    return serviceId; 
  };
  /*}}}*/

  /*{{{ unRegisterService() */
  /**
   * 注销服务
   * @param {Object} id
   * @param {Function} callback
   */
  _me.unRegisterService = function(id, callback){
    var delEvent = zkTools.del(serviceMap[id]);

    delEvent.on('err', function (err) {
      callback(err);
    });

    delEvent.on('ok', function () {
      serviceNode = undefined;
      callback();
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
  _me.subscribe = function(name, filter, callback){
    var key = JSON.stringify({
      name   : name,
      filter : filter
    });

    var service = new Service();
    var loadEvent = loadService(key, name, filter, service);

    loadEvent.on('err', function (err) {
      if (err && err.name === 'CONNECT_ERROR') {
        if (!cache.isLoaded()) {
          cache.loadCache();
        }
        var data = cache.getServiceCache(key);
        var list = data || [];
        service.setList(list);
        service.setOK();
        callback();
      } else {
        callback(err);
      }
    });

    loadEvent.on('ok', function (data) {
      data = tools.merge(data);
      cache.setServiceCache(key, data);
      service.setList(data);
      service.setOK();
      callback();
    });

    loadEvent.on('update', function (data) {
      var pre = service.getServiceAll();
      data = tools.merge(data);
      cache.setServiceCache(key, data);
      service.setList(data);
      if (tools.isDiff(pre, service.getServiceAll())) {
        service.emit('update', service.getServiceAll());
      }
    });

    serviceArr.push(service);
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

  /*{{{ set()*/
  _me.set = function(path, content, callback){
    path = (path.charAt(0) === '/') ? path.substr(1) : path;
    var checkEvent = new Event();

    checkEvent.on('err', function (err) {
      callback(err);
      return;
    });

    checkEvent.on('ok', function () {
      var entirePath = '/' + CONSTANTS.APP_ROOT + '/' + path; 
      var existEvent = zkTools.ifExist(entirePath);

      existEvent.on('err', function (err) {
        var createEvent = zkTools.createNode(entirePath, content, CONSTANTS.INFO_NODE_TYPE);

        createEvent.on('err', function (err) {
          callback(err);
          return;
        });

        createEvent.on('ok', function () {
          callback();
          return;
        });

      });

      existEvent.on('ok', function () {
        var setEvent = zkTools.set(entirePath, content);

        setEvent.on('err', function (err) {
          callback(err);
          return;
        });

        setEvent.on('ok', function () {
          callback();
          return;
        });
      });
    });

    checkZK(checkEvent);

  };
  /*}}}*/

  /*{{{ get()*/
  _me.get = function(path, callback){
    path = (path.charAt(0) === '/') ? path.substr(1) : path;
    var eve = new Event();

    var checkEvent = new Event();

    checkEvent.on('err', function (err) {
      if (err && err.name === 'CONNECT_ERROR') {
        if (!cache.isLoaded()) {
          cache.loadCache();
        }
        var data = cache.getAppCache(path);
        if(data){
          callback(null, data.version, data.data);
        }
      } else {
        callback(err);
      }
    });

    checkEvent.on('ok', function () {
      var entirePath = '/' + CONSTANTS.APP_ROOT + '/' + path; 
      var getEvent = zkTools.get2(entirePath);

      getEvent.on('err', function (err) {
        eve.emit('err', err);
      });

      getEvent.on('ok', function (stat, data) {
        var info = {
          version : stat.version,
          data    : data
        }
        cache.setAppCache(path, info);
        callback(null, stat.version, data);
      });

      getEvent.on('update', function (stat, data) {
        var info = {
          version : stat.version,
          data    : data
        }
        cache.setAppCache(path, info);
        eve.emit('update', stat.version, data);
      });

      getEvent.on('delete', function () {
        cache.delAppCache(path);
        eve.emit('delete');
      });
      
    });
    checkZK(checkEvent);

    return eve;
  };
  /*}}}*/

  /*{{{ del()*/
  _me.del = function(path, version, callback){
    path = (path.charAt(0) === '/') ? path.substr(1) : path;
    var checkEvent = new Event();

    checkEvent.on('err', function (err) {
      callback(err);
    });

    checkEvent.on('ok', function () {
      var delEvent = zkTools.del('/' + CONSTANTS.APP_ROOT + '/' + path, version);
      
      delEvent.on('err', function (err) {
        callback(err);
      });

      delEvent.on('ok', function () {
        callback();
      });
    });

    checkZK(checkEvent);
  };
  /*}}}*/

  /*{{{ recover()*/
  /**
   * 回复客户端zk
   */
  _me.recover = function(){
    if (zk !== undefined) {
      zk.close();
    }

    zk = undefined;
    zkStat = CONSTANTS.ZK_NOT_OK;
    serviceNode = undefined;
    cache.clean();
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
      'cachepath' : opts.cachepath || CONSTANTS.DEFAULT_PATH,
    }
    Cache.init(config.cachepath);
  }
  /*}}}*/

  _me.setConfig(options);

  return _me;

}

/*{{{ checkZK() */
/**
 * 检查zk是否初始化
 * @param {Function} event 检查后需要触发的事件对象 
 */
function checkZK (event) {
  if (zkStat === CONSTANTS.ZK_OK) {
    event.emit('ok');
    return;
  }
  zkQueue.push(event);

  if (zkStat === CONSTANTS.ZK_WAITING) {
    return;
  }

  zk = new ZooKeeper({
    connect : config.zookeeper,
    timeout : CONSTANTS.DEFAULT_TM,
    host_order_deterministic : CONSTANTS.HOST_ORDER
  });

  zk.on(ZooKeeper.on_closed, function () {
    zkStat = CONSTANTS.ZK_NOT_OK;
    while (serviceArr.length > 0) {
      serviceArr.pop().emit('closed');
    }
  });

  zkStat = CONSTANTS.ZK_WAITING;
  zk.connect(function (err) {
    if (err) {
      var iError = new MyError('CONNECT_ERROR', err);
      for (var i = 0;i < zkQueue.length; i++) {
        zkQueue[i].emit('err', iError);
      }
    } else {
      zkTools.init(zk);
      zkStat = CONSTANTS.ZK_OK;
      while (zkQueue.length > 0) {
        zkQueue.pop().emit('ok');
      }
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
function createService(node, info, callback){
  info._PATH_ = node;
  var createEvent = zkTools.createNode(node, info, CONSTANTS.REG_NODE_TYPE);

  createEvent.on('err', function (err) {
    callback(err);
  });

  createEvent.on('ok', function (path) {
    serviceNode = node;
    callback();
  });
}
/*}}}*/

/*{{{ loadService()*/
/**
 * 搜索服务
 * @param {String} key 全局键
 * @param {String} name 服务名
 * @param {Object} filter 筛选条件
 * @return {Object} 事件对象
 */
function loadService(key, name, filter){
  var loadEvent = new Event();

  var checkEvent = new Event();
  checkEvent.on('err', function (err) {
    loadEvent.emit('err', err);
  });

  checkEvent.on('ok', function(){
    var serviceName = '/' + CONSTANTS.SERVICE_ROOT + '/' + name;

    var childrenEvent = zkTools.getChildren(serviceName, true);
    childrenEvent.on('err', function (err) {
      loadEvent.emit('err', err);
    });

    childrenEvent.on('ok', function (children) {
      dealVersions(key, serviceName, children, filter, loadEvent, true);
    });

    childrenEvent.on('update', function (children) {
      dealVersions(key, serviceName, children, filter, loadEvent, false);
    });

  });

  checkZK(checkEvent);
  return loadEvent;
}
/*}}}*/

/*{{{ dealVersions()*/
function dealVersions(key, path, versions, filter, loadEvent, first){
  reset(key);

  versions = filterNodes(versions, filter);
  if(versions === false){
    loadEvent.emit('err', new MyError('FILTER_WRONG', 'filter is wrong'));
    return;
  }

  if (versions.length === 0) {
    if (first) {
      loadEvent.emit('ok', {});
    } else {
      loadEvent.emit('update', {});
    }
    return;
  }

  var resultGroup = new ResultGroup(versions, function (list) {
    if (first) {
      loadEvent.emit('ok', list);
    } else {
      loadEvent.emit('update', list);
    }
  });

  for (var i = 0;i < versions.length; i++) {
    (function () {
      var saveI = i;
      var versionEvent = dealVersion(key, path + '/' + versions[saveI], filter);
      
      versionEvent.on('err', function (err) {
        resultGroup.setErr(versions[saveI], err);
      });

      versionEvent.on('ok', function (info) {
        resultGroup.setInfo(versions[saveI], info);
      });

      versionEvent.on('update', function (info) {
        resultGroup.setInfo(versions[saveI], info);
        loadEvent.emit('update', resultGroup.getList());
      });
    })();
  }
}
/*}}}*/

/*{{{ dealVersion()*/
function dealVersion(key, versionPath, filter){
  var retEvent = new Event();
  retEvent.innerEvent = [];
  operMap[key].event.push(retEvent);

  var childrenEvent = zkTools.getChildren(versionPath, true);
  operMap[key].toolEvent.push(childrenEvent);

  childrenEvent.on('err', function (err) {
    retEvent.emit('err', err, null);
  });

  childrenEvent.on('ok', function (children) {
    dealNodes(key, versionPath, children, filter, retEvent, retEvent.innerEvent, true);
  });

  childrenEvent.on('update', function (children) {
    for(var i = 0;i < retEvent.innerEvent.length; i++){
      retEvent.innerEvent[i].removeAllListeners();
      retEvent.innerEvent[i].useless = true;
    }
    retEvent.innerEvent = [];
    dealNodes(key, versionPath, children, filter, retEvent, retEvent.innerEvent, false);
  });

  return retEvent;
}
/*}}}*/

/*{{{ dealNodes()*/
function dealNodes(key, path, nodes, filter, event, eventArr, first){
  if (nodes.length === 0) {
    event.emit('ok', []);
    return;
  }

  var resultGroup = new ResultGroup(nodes, function (list) {
    if (first) {
      event.emit('ok', list);
    } else {
      event.emit('update', list);
    }
  });

  for (var i = 0;i < nodes.length; i++) {
    (function () {
      var saveI = i;
      var childEvent = zkTools.get(path + '/' + nodes[saveI], true);
      eventArr.push(childEvent);

      childEvent.on('err', function (err) {
        resultGroup.setErr(nodes[saveI], err);
      });

      childEvent.on('ok', function (stat, data) {
        data = checkNode(data, filter);
        if (data) {
          resultGroup.setInfo(nodes[saveI], data);
        } else {
          resultGroup.setInfo(nodes[saveI], null);
        }
      });

      childEvent.on('update', function (stat, data) {
        data = checkNode(data, filter);
        if (data) {
          resultGroup.setInfo(nodes[saveI], data);
        } else {
          resultGroup.setInfo(nodes[saveI], null);
        }
        event.emit('update', resultGroup.getList());
      });

    })();
  }
}
/*}}}*/

/*{{{ filterNodes() */
/**
 * 根据删选条件，枚举版本节点
 * @param {Array} children 所有版本节点
 * @param {Object} filter 筛选条件
 * @return {Array|boolean}具体版本或者版本列表或者错误false
 */
function filterNodes(children, filter){
  if (typeof filter === 'string') {
    return findVersion(children,filter);

  } else if (typeof filter === 'object') {
    if (filter.version === undefined) {
      return findVersion(children, CONSTANTS.RECENT);

    } else if (typeof filter.version === 'string') {
      return findVersion(children, filter.version);

    } else if (typeof filter.version === 'object') {
      var max = (filter.version.max) ? (filter.version.max) : 'z';
      var min = (filter.version.min) ? (filter.version.min) : '';
      var res = [];
      
      for (var i = 0;i < children.length; i++) {
        if (children[i] >= min && children[i] <= max) {
          res.push(children[i]);
        }
      }
      return res;
    
    } else {
      return false;
    }

  } else {
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
function checkNode(data, filter){
  if (filter.room !== undefined) {
    if (data.meta.room !== filter.room) {
      return false;
    }
    return data;
  } else {
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
function findVersion(children, version) {
  var res = [];
  if (version === CONSTANTS.RECENT) {
    var m = tools.max(children);
    if (m !== '') {
      res.push(m);
    }
    return res;
  } else {
    if (tools.exist(children,version)) {
      res.push(version);
    }
    return res;
  }
}
/*}}}*/

/*{{{ reset() */
function reset(key){
  if (!operMap[key]) {
    operMap[key] = {
      'event'     : [],
      'toolEvent' : []
    }
  } else {
    while (operMap[key].event.length > 0) {
      var eve = operMap[key].event.pop();
      eve.removeAllListeners();
      for (var i = 0;i < eve.innerEvent.length; i++) {
        eve.useless = true;
        eve.innerEvent[i].removeAllListeners();
      }
    }
    while (operMap[key].toolEvent.length > 0) {
      var one = operMap[key].toolEvent.pop();
      one.useless = true;
      one.removeAllListeners();
    }
  }
}
/*}}}*/

