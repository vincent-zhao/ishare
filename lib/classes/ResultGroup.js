/**
 * 结果归类类，用于多个异步操作整合
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */

var Event = require('events').EventEmitter;
var tools = require('../tools');

/*{{{ ResultGroup constructor*/
function ResultGroup (arr, func) {
  this.arr       = arr;
  this.func      = func;
  this.nodesInfo = {};
  this.init();
}
/*}}}*/

/*{{{ ResultGroup.prototype.init()*/
ResultGroup.prototype.init = function () {
  var _self = this;
  for (var i = 0;i < _self.arr.length; i++) {
    this.nodesInfo[_self.arr[i]] = {
      'error' : null,
      'info'  : null,
      'ok'    : false
    }
  }
  
  _self.arrive = new Event();
  _self.arrive.on('arrived', function () {
    var allOk = true;
    for (var j in _self.nodesInfo) {
      if (_self.nodesInfo[j].ok === false) {
        allOk = false;
      }
    }

    if (allOk) {
      _self.func(_self.getList());
      _self.arrive.removeAllListeners();
    }
  });
}
/*}}}*/

/*{{{ ResultGroup.prototype.setInfo()*/
ResultGroup.prototype.setInfo = function (key, info) {
  this.nodesInfo[key].info = info;
  this.nodesInfo[key].ok   = true;
  this.arrive.emit('arrived');
}
/*}}}*/

/*{{{ ResultGroup.prototype.setErr()*/
ResultGroup.prototype.setErr = function (key, err) {
  this.nodesInfo[key].err  = err;
  this.nodesInfo[key].ok   = true;
  this.arrive.emit('arrived');
}
/*}}}*/

/*{{{ ResultGroup.prototype.getList()*/
ResultGroup.prototype.getList = function () {
  var list = [];
  for (var j in this.nodesInfo) {
    if (this.nodesInfo[j].info) {
      list.push(tools.objectClone(this.nodesInfo[j].info));
    }
  }
  return list;
}
/*}}}*/

module.exports = ResultGroup;
