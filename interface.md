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


订阅服务

订阅感兴趣的服务：在获得机器列表前，需要订阅服务，以此让ishare去获得对应服务并且监听服务的变化。

```javascript
var service = ishare.subscribe('serviceName', );

```