/**
 * Service类
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */


var events  = require('events');
var util    = require('util');
var http    = require('http');
var url     = require('url');

var MyError = require('./Error');
var tools   = require('../tools');

var CONSTANTS = {
  'CHECK_TM' : 2000,
  'DEFAULT_INTERVAL' : 5000
}

/*{{{ Service constructor */
/**
 * Service对象构造函数
 */
function Service() {
  this.list = [];
  this.available = [];
  this.pointer = 0;
  this.ok = false;
}
util.inherits(Service, events.EventEmitter);
module.exports = Service;
/*}}}*/

/*{{{ Service.prototype.setList() */
/**
 * 设置service对象的服务列表
 * @param {String} key 键
 * @param {Array} list 列表
 */
Service.prototype.setList = function (list) {
  this.list = tools.objectClone(list);
  this.available = [];
  for (var i = 0;i < list.length; i++) {
    this.available.push(list[i].addr);
  }
}
/*}}}*/

/*{{{ Service.prototype.getList()*/
Service.prototype.getList = function () {
  return tools.objectClone(this.list);
}
/*}}}*/

/*{{{ Service.prototype.getServiceAll() */
/**
 * 获取可用服务列表
 * @return {Array} 
 */
Service.prototype.getServiceAll = function () {
  return tools.objectClone(this.available);
}
/*}}}*/

/*{{{ Service.prototype.getServiceAny() */
/**
 * 获取服务列表中的一个服务
 * @return {String}
 */
Service.prototype.getServiceAny = function () {
  return this.available[(this.pointer++)%this.available.length];
}
/*}}}*/

/*{{{ Service.prototype.heartbeat() */
/**
 * 心跳设置
 * @param {Function} func 心跳方法
 * @param {int} interval 心跳时间间隔
 */
Service.prototype.heartbeat = function (func, interval) {
  interval = interval || CONSTANTS.DEFAULT_INTERVAL;
  var _self = this;
  setInterval(function () {
    if (!_self.ok) {
      return;
    }

    var tmp      = [];
    var count    = _self.list.length;
    var preAvail = _self.getServiceAll();

    if (func === 'default') {
      func = defaultHB;
    }

    _self.list.forEach(function (one) {
      func(one.addr, function (err) {
        if (!err) {
          tmp.push(one.addr);
        }
        if (--count === 0) {
          if (tools.isDiff(_self.available, preAvail)) {
            return;
          }
          if (tools.isDiff(_self.available, tmp)) {
            _self.available = tools.objectClone(tmp);
            _self.emit('update', _self.getServiceAll());
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
Service.prototype.setOK = function () {
  this.ok = true;
}
/*}}}*/

/*{{{ defaultHB()*/
/**
 * 默认心跳方法
 * @param {String} addr 要检查的服务路径
 * @param {Function} cb 回调函数
 */
function defaultHB(addr, callback) {
  if(!/^(http:\/\/)/.test(addr)){
    addr = 'http://' + addr;
  }
  var addrInfo = url.parse(addr);
  var options = {
    host   : addrInfo.hostname,
    port   : addrInfo.port || 80,
    path   : addrInfo.path,
    method : 'GET',
  }

  var id;
  var req = http.request(options, function(res){
    clearTimeout(id);
    if (res.statusCode < 300 && res.statusCode >= 200) {
      callback();
    } else {
      callback(new MyError('SERVICE_SEND_WRONG_CODE'));
    }
  });
  req.end();
  req.on('error', function(err){
    callback(new MyError('SERVICE_UNAVAILABLE'));
  });

  id = setTimeout(function () {
    req.abort();
  }, CONSTANTS.CHECK_TM);
}
/*}}}*/
