# 介绍

`ishare`是一个nodejs客户端，其配合zookeeper来提供服务协调的功能。用户可以使用此客户端在zookeeper上方便的注册服务或者获取服务。服务注册注销和服务之间的相互调用变得非常便捷。

# 使用场景

经常会有这样的一些场景：

* 多个服务之间存在依赖，即服务需要调用服务。然而服务的获取往往通过配置文件得知其他服务的信息。如果被依赖服务出现问题，主动或者被迫下线，则需要手工修改配置文件或者发送系统信号的方式来通知依赖下线服务的服务。
* 同样，如果被依赖服务添加机器，调用此服务的服务也需要人工参与获得信息。
* 服务新版本上线往往无法做到完全平滑。
* 服务更新版本，重新在一些机器上布置或者以新端口方式提供服务（旧服务不下线可能是因为方便回滚或者作比较等），此时调用此服务的服务方也需要人工干预。

上述四种为常见情况，如果服务很多，相互之间的调用关系复杂，那么上述问题造成的麻烦会以指数级增长，一个失误就会引起线上的故障。怎么办？`ishare`帮你搞定一切。

# 功能

* 将服务注册到zookeeper上：调用此服务的服务可以通过名字直接获取此服务信息，并且在获取后，如果此服务发生变化，会收到通知。
* 注销服务,服务下线：调用此服务的服务会收到相应通知。
* 获取服务：直接通过约定好的服务名字获取服务，并且此服务发生变化时会得到通知。

# 进阶

* 服务选择：获取服务时，除了指定服务名称，还可以指定需要获取的服务版本，提供范围控制。还可以设置获得当前服务的最新版本，无需知道服务的具体版本号。
* 心跳监测：nodejs客户端会对请求到的服务维持心跳监测。
* 版本控制：版本节点自动添加

# 接口

**初始化客户端：init(options);**

* options : 初始化信息，具体定义如下

```javascript
var options : {
  address : 'localhost:2181/',//zk地址
  username : '',//用户名，暂无用
  password : '',//密码，暂无用
  cacheFile : '',//本地化文件路径
}
```

**注册服务：registerService(serviceName,version,options,serviceAddr,cb);**

* serviceName : 服务名称
* version : 服务版本号
* options ：指定注册时需要填写的信息
* serviceAddr : 服务地址
* cb : 回调函数，注册完毕回调

example:

```javascript
var IShare = require('ishare');

IShare.registerService('testService','1.0',
  {
    room:'CM4',
    ....
  },
  'http://1.1.1.1:80',
  ,function(err){
    if(err) throw new Error(err);
  }
);
```

**注销服务：unRegisterService(cb);**

* cb:注销动作后的回调函数

example:

```javascript
var IShare = require('ishare');

IShare.unRegisterService(function(err){
  if(err) throw new Error(err);
});
```

**订阅服务：subscribe(serviceName,filter,cb);**

* serviceName : 服务名称
* filter ：服务筛选条件
* cb ：订阅动作的回调

**获取所有服务：getServiceAll(serviceName,filter,ctlInfo,cb,w_cb);**

* serviceName:服务名称
* filter:服务筛选条件
* ctlInfo:控制信息，包括session超时时间和心跳检测函数等,心跳检测函数需要用户传入，具体使用方式在下面例子中说明，如果不指定心跳检测函数，则使用默认检测方式，默认检测方式为向服务发送http请求监听响应来检查。
* cb:获取服务后的回调函数
* w_cb:获取服务发生变化后的回调函数(可以设置为false，表示不对变化做相应)

example:

```javascript
var IShare = require('ishare');

/*
  filter可以是字符串表示某个具体的版本或者是一个对象,设置为0表示获取最新服务
  对象中可以指定筛选条件，例如版本选择和机房选择
  方法获取的是符合条件的所有服务信息
*/
IShare.getServiceAll('testServiceName',
  {
    version:{
      min:'1.0',
      max:'2.0'
    },
    room:'ROOM1'
  },
  {
    tm:10000,
    hbFunc:function(addr,cb){
      //addr为服务的地址，可能是url或者是其他表示服务地址的字符串
      //cb为检测好后的回调函数，如果心跳发现服务不可用或者其他意外情况，如下调用回调函数：
      //cb(err);   err为错误信息。
    }
  }
  ,function(err,serviceInfos){
    //get serviceInfos after call this function
  }
  ,function(err,serviceInfos){
    //If one of thoses services is changed,the function is called.
  }
);
```

**获取任一服务：getServiceAny(serviceName,filter,ctlInfo,cb,w_cb);**

* serviceName:服务名称
* filter:服务筛选条件
* ctlInfo:和getServiceAll一样
* cb:获取服务后的回调函数
* w_cb:获取服务发生变化后的回调函数(可以设置为false，表示不对变化做相应)

example:

```javascript
var IShare = require('ishare');

/*
  filter可以是字符串表示某个具体的版本或者是一个对象,设置成0表示获取最新服务
  对象中可以指定筛选条件，例如版本选择和机房选择
  方法获取的是符合条件的所有服务中的一个服务信息
*/
IShare.getServiceAny('testServiceName','0',
  {
    tm:10000,
    //说明如上面getServiceAll
    hbFunc:function(addr,cb){}
  }
  ,function(err,serviceInfo){
    //get one serviceInfo after call this function
  }
  ,function(err){
    //If this service is changed,the function is called.
  }
);
```

# 安装
```bash
$ npm install ishare 
```

# 使用
```javascript
var IShare = require('ishare');
//IShare初始化方式，用来指明zk的地址等，这步很重要
IShare.init({
  addr:'localhost:2181',//zookeeper集群地址，多个地址以"，"分割，必填！
  user:'',//用户名，暂时无用，以后会提供全线检查
  pwd:'',//密码，暂时无用，原因同用户名
  localPath:'',//本地文件保存路径，用于连不上zk时获得service信息，默认__dirname+'/.cache'
  root:''//根路径，默认/service
  checkInterval:''//心跳检测间隔，默认500
});
```
其他的接口上述都已介绍。

# 测试
修改test/test_config目录中的zk地址，然后在根目录下运行make就可以进行单元测试

# 问题
IShare详细的使用方式可以参考test目录下单元测试，如有问题欢迎和我联系，见下面联系方式。

# 联系方式
yixuan.zzq@taobao.com / zzqvincent@gmail.com
