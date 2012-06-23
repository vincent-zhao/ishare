# 接口使用

ishare初始化：

提供zk地址，用户名密码等信息初始化ishare

```JavaScript
var iShare = require('iShare');

var ishare = iShare.createClient({
  zookeeper : '127.0.0.1:2181', //zk地址
  username  : '', //用户名（暂无用）
  password  : '', //密码（暂无用）
  cachepath : './.cache' //本地化文件地址
});
```

注册服务：

如果想要把服务注册到zookeeper上，需要调用registerService方法。

```javascript
/**
 * @param {string}   name 服务名称
 * @param {string}   version 版本号
 * @param {string}   addr 服务地址（服务调用方可访问方式）
 * @param {object}   meta 权重（暂时无用）
 * @param {function} callback 注册完毕后回调函数
 * 判断callback第一个参数，如果存在，表示注册出现错误，如果为undefined表示注册成功。
 * @return {int}     返回服务id号，用于注销服务。
 */
var serviceId = ishare.registerService(name, version, addr, meta, callback);
```

注销服务：

如果想要把服务从zookeeper上注销掉，调用unRegisterService方法。

```javascript
/**
 * @param {int} serviceId 服务id号
 * @param {function} callback 注销完毕后的回调函数，和registerService一样，需要判断第一个参数
 */
ishare.unRegisterService(serviceId, callback);
```


订阅并且获取服务:

在获得机器列表前，需要订阅服务，以此让ishare去获得对应服务并且监听服务的变化。

订阅函数会返回一个对象，通过这个对象你可以做很多事情，例如：

* 获取任一服务：以获得所有可用服务中的一个，ishare内部做好了负载均衡。
* 获取所有服务：获得所有可用服务。
* 设置健康检查函数：设置关注服务的健康检查方式。
* 监听服务变化：设置监听函数监听服务的变化。
* 监听服务错误信息：设置监听函数监听ishare获取服务产生的错误。

```javascript
/**
 * @param {string} name 服务名称
 * @param {string|object} filter 服务筛选条件
 * @param {function} callback 订阅回调函数, 同注册的回调函数
 * @return {object} 服务对象
 */
var service = ishare.subscribe(name, filter, callback);

/**
 * @return {string} 某个可用服务的addr
 */
var one = service.getServiceAny();

/**
 * @return {array[string]} 所有可用服务的addr数组
 */
var list = service.getServiceAll();

/**
 * 设置健康检查函数
 * @param {function} func 健康监测函数（可以设置为‘default’，启动默认心跳函数）
 *  默认心跳函数是采用http方式进行检查
 *  func有两个参数
 *  eg：heartbeatFunction(addr, callback);
 *  addr为服务地址
 *  callback为心跳监测函数的回调函数，心跳监测正常则回调空(callback())，如果有异常，则回调一个错误对象,callback(err);
 * @param {int} interval 健康监测函数的检查间隔时间，不设置则采用默认值
 */
service.heartbeat(func, interval);

/**
 * 当监听的服务发生变化时，会触发update事件，并且把新的服务列表返回。
 * 如果你是调用后面提到的获取服务方法，则机器上下线的情况会对你透明，你只需要调用获取服务的方法就行。
 */
service.on('update', function(data){
});

/**
 * 当监听的服务发生错误的时候，会触发err事件，并且把错误对象返回。
 */
service.on('err', function(err){
});
```

设置共享资源：

调用get方法在zookeeper上设置共享资源

```javascript
```
