# 介绍

`ishare`是一个nodejs客户端，其配合zookeeper来提供服务协调的功能。

`ishare`主要提供了两种功能：
* 服务管理：用户可以使用此客户端在zookeeper上方便的注册服务或者获取其他已经注册的服务。同时可以监听在服务上，当服务发生变化时执行相应的操作。
* 资源共享：用户可以在zookeeper上针对每个应用共享信息。例如可以将配置文件保存在zookeeper上，另一方可以通过简单的API获得资源并且观察在这个资源上。


# 使用场景

经常会有这样的一些场景：

* 多个服务之间存在依赖，即服务需要调用服务。然而服务的获取往往通过配置文件得知其他服务的信息。如果被依赖服务出现问题，主动或者被迫下线，则需要手工修改配置文件或者发送系统信号的方式来通知依赖下线服务的服务。
* 同样，如果被依赖服务添加机器，调用此服务的服务也需要人工参与获得信息。
* 服务新版本上线往往无法做到完全平滑。
* 服务更新版本，重新在一些机器上布置或者以新端口方式提供服务（旧服务不下线可能是因为方便回滚或者作比较等），此时调用此服务的服务方也需要人工干预。
* 服务之间需要共享一些资源，比如某些黑白名单。一般的方式是在每个服务可能会暴露一个专门用户服务直接交流的接口，当服务变多，这将变得非常麻烦。此外当这些资源发生变化的时候，服务之间的相互通知也变得非常繁琐。

上述五种为常见情况，如果服务很多，相互之间的调用关系复杂，那么上述问题造成的麻烦会以指数级增长，一个失误就会引起线上的故障。怎么办？`ishare`帮你搞定一切。

# 功能

* 将服务注册到zookeeper上：调用此服务的服务可以通过名字直接获取此服务信息，并且在获取后，如果此服务发生变化，会收到通知。
* 注销服务,服务下线：调用此服务的服务会收到相应通知。
* 获取服务：直接通过约定好的服务名字获取服务，并且此服务发生变化时会得到通知。
* 设置共享资源：将资源放到zookeeper上，其他服务可以通过约定好的路径访问这个资源。
* 获取共享资源：和上一点对应，可以获得放置在zookeeper上的资源。

# 进阶

* 服务选择：获取服务时，除了指定服务名称，还可以指定需要获取的服务版本，提供范围控制。还可以设置获得当前服务的最新版本，无需知道服务的具体版本号。
* 心跳监测：nodejs客户端会对请求到的服务维持心跳监测。
* 版本控制：版本节点自动添加
* 资源监听：服务在获得共享资源的同时可以监听在某些资源上，当资源发生变化的时候，执行相应的操作。

# 接口
见interface.md文件

# 安装
```bash
$ npm install ishare 
```
注：如果已经在全局下安装过zookeeper包，则只需要运行上述命令即可。如果什么都没有安装过，进入ishare安装目录，运行make install。你可能需要等待一会儿。

然后进入ishare安装目录，运行：
```bash
npm install
```

# 使用
```javascript
var iShare = require('ishare').createClient({
  zookeeper:'',//zk地址
  username:'',//用户名（暂无用）
  password:'',//密码（暂无用）
  cachepath:''//本地化文件路径
});
```

# 测试
修改test/test_config目录中的zk地址，然后在根目录下运行make就可以进行单元测试

# 问题
IShare详细的使用方式可以参考test目录下单元测试，如有问题欢迎和我联系，见下面联系方式。

# 联系方式
yixuan.zzq@taobao.com / zzqvincent@gmail.com
