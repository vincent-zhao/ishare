
```javascript
exports.createClient    = function (options) {

  /**
   * @zookeeper配置
   */
  var config  = {
    'zookeeper' : '127.0.0.1:2181/,localhost:2181/',
    'username'  : '',
    'password'  : '',
    'cachepath' : '',
  };

  var _me = {};

  /**
   * 注册服务
   *
   * @access public
   * @param {String} name       : service name, e.g. service1
   * @param {String} version    : service version, e.g. 1.0
   * @param {String|Object} addr: service address, anything you want
   * @param {Object} meta       : 
   * @param {Function} callback
   */
  _me.registerService   = function (name, version, addr, meta, callback) {
    meta    = meta || {
      'weight'  : 1,    /**<    选择权重    */
    };

    var id  = '';       /**<    临时节点id  */

    return id;
  };

  _me.unregisterService = function (name, version, id) {
  };

  _me.subscribe = function (name, filter, callback) {

    var service = {};

    /**
     *
     * service.emit('change', newlist);
     */

    /**
     * @注册心跳函数
     */
    service.heartbeat   = function (func, interval) {
    };

    service.getServiceAll   = function () {
    };

    service.getServiceAny   = function () {
    };

    return service;
  };

  _me.unsubscribe   = function (name) {
  };

  return _me;
};
```
