```javascript
exports.createClient = function(options){

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
   * @param {String} name       : service name, e.g. service1
   * @param {String} version    : service version, e.g. 1.0
   * @param {String|Object} addr: service address, anything you want
   * @param {Object} meta       : 
   * @param {Function} callback
   * @return {Object}
   */
  _me.registerService   = function (name, version, addr, meta, callback) {

    var id  = '';       /**<    临时节点id  */

    return id;
  };

  /**
   * 注销服务
   * @param {Object} id registerService返回的id对象
   * @param {Function} callback
   */
  _me.unregisterService = function (id, callback);

  /**
   * 订阅服务
   * @param {String} name          : service name e.g. service1
   * @param {String|Object} filter : filter for service e.g. '1.0' or {version:{min:'1.0'}}
   * @param {Function} callback    
   */
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

    /**
     * 获取所有的服务
     */
    service.getServiceAll   = function () {
    };

    /**
     * 获取其中一个服务
     */
    service.getServiceAny   = function () {
    };

    return service;
  };

  /**
   * 取消订阅
   * @暂时没实现
   */
  _me.unsubscribe   = function (name) {
  };

  return _me;

}
```
