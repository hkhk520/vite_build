import {
  rdsRequest,
  closeRdsSocket,
  linkPerfectSite,
  GetRdsSocket,
  createResWebSocket,
  lastAliveTime,
  setLastAliveTime,
  SetWebSocketMessageCallback
} from "./rdsSocket"
import http from "./http"
import dayjs from 'dayjs'
import { useNetwork } from '@vueuse/core'
import getVerify from './verify'
import encryption from './encryption'

let jybSession  // 登录/jybapp/login/GetUserInfo的session
let jybUid      // 登录/jybapp/login/GetUserInfo的uid
let connectionTime  // 连接rds的时间
let currentRdsSite  // 当前的最优站点
let allLogData = []      // 保存全部日志信息
let jybdata = ''   // 保存当前的jyb域名
let cloudapi = ''   // 保存当前的cloudapi域名 
let isPro
// 设置连接状态回调的实参
let ConnectionStatus = {
  status: 0,//0已断开
  msg: "未登录，请先登录"
}
let connectionStatusCallback = function (connectionStatus) { } // 连接状态回调
let servicepkg   // 保存服务包
const { effectiveType } = useNetwork();  // 获取当前的网络设备

/**
 * @name: Login    /jybapp/login/GetUserInfo
 * @desc: 登录 /jybapp/login/GetUserInfo
 * @param: 
 */
export async function Login(userName, session, ipAddress, remark, appVer, appKey, terminal, isProduct) {
  isPro = isProduct
  if (userName === 'Anonymous') userName = ''

  // 查询域名
  const { data } = await SendHttpRequest('jybdata', `/jybapp/other/servers?org=org_gta_mob&version=6.0&network=${effectiveType.value}&ver=7.1.0&lang=chs`)
  jybdata = data.jybdata;
  cloudapi = data.cloudapi;

  // 初始化查询所有服务和站点
  const res = await SendHttpRequest('jybdata', `/jybapp/login/GetUserInfo?session=${session}&org=org_gta_mob&version=1.0&network=${effectiveType.value}&ver=${appVer}&lang=chs`, { userName, ipAddress, appKey, terminal })

  if (res.result == 1) {
    const { data, result } = res;

    jybSession = data.session ? data.session : '';  // 匿名、客户登录 都有返回
    jybUid = data.uid ? data.uid : '';  // 客户登录 才有返回
    const allRdsSite = data.rds_servers; // 匿名、客户登录 都有返回
    servicepkg = data.pkg;  // 保存服务包

    // 连接 最优的 实时 站点
    currentRdsSite = await linkPerfectSite(allRdsSite);

    // 登录rds
    const alalParams = {
      stype: 0,   // 0:登录  4:退出
      verify: getVerify(),//标识码,说明：客户端使用, 服务端原样返回
      servicepkg,   // 用户服务包列表
      url: `pkgtype=alal&org=GTA&uid=${jybUid}&sessiontype=200&terminal=h5`
    }
    const { stext } = await SendWebSocketAsyncRequest(alalParams)
    connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // rds的登录失败判断
    if (stext.result == 1) {
      if (stext.data.statusid == -9) {
        return { result: -1000, msg: 'session失效，请重新登录' }
      }
      if (stext.data.statusid != 0) {
        return { result: 0, msg: 'rds登录失败' }
      }
    } else {
      return { result: 0, msg: 'rds登录失败' }
    }

    // 设置连接状态回调的实参
    ConnectionStatus = {
      status: 1,//连接正常
      msg: "连接正常"
    }
    // 触发连接状态回调
    connectionStatusCallback(ConnectionStatus)

    return {
      result,
      msg: '登录成功'
    }
  } else {
    return res
  }
}

// 定时检查rds的连接状态，重连
setInterval(function () {
  const rdsSocket = GetRdsSocket()

  if (rdsSocket && (!lastAliveTime || (lastAliveTime && (lastAliveTime + 4 * 1000) < new Date().getTime()))) {
    // 设置连接状态回调的实参
    ConnectionStatus = {
      status: 0,//0已断开
      msg: "已断开，正在重连"
    }
    // 触发连接状态回调
    connectionStatusCallback(ConnectionStatus)
    // lastAliveTime 置空
    setLastAliveTime()
    // 调用rds重连方法
    ReconnectionRds(jybUid, currentRdsSite);
  }

  // 主动发送rds的心跳，检查rds连接状态
  const verify = "heartbeat"
  const { hashCode } = encryption('sitespeed', verify);
  const security = hashCode;  // 生成加密的 security
  const pkgobj = {
    stype: 1,
    verify,
    stext: 'pkgtype=sitespeed',
    security
  }

  if (rdsSocket && rdsSocket.readyState == 1 && ConnectionStatus.status == 1 && lastAliveTime) {
    rdsSocket.send(JSON.stringify(pkgobj))
  }

}, 2000)

/**
 * @name: ReconnectionRds   
 * @desc: 重连rds方法 重新查询服务包返回的站点，重新最优连接rds
 * @param: rdsSite：当前的默认站点, 为空时，证明当前站点连不上
 */
async function ReconnectionRds(jybUid, rdsSite) {
  let res
  // 查询服务包所有站点
  try {
    res = await SendHttpRequest('jybdata', `/jybapp/config/GetServerList?uid=${jybUid}&org=org_gta_mob&network=${effectiveType.value}&ver=8.1.55&lang=chs`);
  } catch (error) {
    return;
  }

  if (res.result == 1) {
    const { data } = res;

    const allRdsSite = data.rds_servers; // 相关权限的站点
    servicepkg = data.pkg;  // 保存服务包

    let siteFlag = false
    if (rdsSite) {
      // 判断是否服务包变化了
      siteFlag = allRdsSite.some(function (item) {
        if (item.domain === rdsSite) return true
      })
    }

    // 存在当前站点，服务包没有变，不需要重新选站
    if (siteFlag) {
      try {
        // 创建WebSocket
        await createResWebSocket(rdsSite);
      } catch (error) {
        // 本次站点连不上，重新获取所有站点，并测速连接最优站点，并终止下面的代码
        return;
      }
    } else {
      // 连接 最优的 实时 站点
      currentRdsSite = await linkPerfectSite(allRdsSite);
    }

    // 登录rds
    const alalParams = {
      stype: 0,   // 0:登录  4:退出
      verify: getVerify(),//标识码,说明：客户端使用, 服务端原样返回
      servicepkg,   // 用户服务包列表
      url: `pkgtype=alal&org=GTA&uid=${jybUid}&sessiontype=200&terminal=h5`
    }
    const { stext } = await SendWebSocketAsyncRequest(alalParams)
    connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // rds的登录成功的判断
    if (stext.result == 1 && stext.data?.statusid == 0) {
      // 设置连接状态回调的实参
      ConnectionStatus = {
        status: 1,//连接正常
        msg: "连接正常"
      }
      // 触发连接状态回调
      connectionStatusCallback(ConnectionStatus)
    }
  }
}

// rds 请求/订阅
export function SendWebSocketAsyncRequest(data) {
  data.session = jybSession  // rds的session使用jybSession
  return rdsRequest(data)
}

// 查询用户行情服务包信息
export async function GetUserMarketPower() {
  return await SendHttpRequest('jybdata', '/jybapp/user/UserAllPower');
}

// HTTP请求
export function SendHttpRequest(channel, url, body) {
  // 除登录外的接口，其他加上 session 和 uid
  if (!url.includes('login')) {
    if (body) {
      body.session = jybSession;
      body.uid = jybUid;
    } else {
      url += /\?/.test(url) ? `&uid=${jybUid}&session=${jybSession}` : `?uid=${jybUid}&session=${jybSession}`
    }
  }

  let domainPrefix  // 域名前缀
  // 添加请求域名
  switch (channel) {
    case 'cloudapi':
      domainPrefix = {
        dev: '/northSouthTrack',
        pro: cloudapi
      }
      break
    case 'jybdata':
      domainPrefix = {
        dev: '/api',
        pro: jybdata
      }
      break
  }

  return http(domainPrefix, url, body)
}

// 退出登录
export async function Logout() {
  if (!jybSession) {
    return { result: 0, msg: '请先登录' }
  }

  // 退出 jyb 登录
  const httpRes = await SendHttpRequest('jybdata', `/jybapp/login/userlogout?uid=${jybUid}&session=${jybSession}&org=org_gta_mob&version=1.0&network=${effectiveType.value}&ver=1.0.0&lang=chs`)

  // 退出 rds 登录
  const alalParams = {
    stype: 4,   // 0:登录  4:退出
    verify: getVerify(),//标识码,说明：客户端使用, 服务端原样返回
    servicepkg,   // 用户服务包列表
    url: `pkgtype=alal&org=GTA&uid=${jybUid}&sessiontype=200&terminal=h5`
  }
  await SendWebSocketAsyncRequest(alalParams)
  closeRdsSocket()  // 关闭rds
  connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss')

  // 清空 session 和 uid 
  jybSession = '';
  jybUid = '';
  // 设置连接状态回调的实参
  ConnectionStatus = {
    status: 0,//0已断开
    msg: "未登录，请先登录"
  }
  // 触发连接状态回调
  connectionStatusCallback(ConnectionStatus)

  return {
    readyState: 2,
    ...httpRes
  }
}

// 查询连接状态
export function GetConnectionStatus() {
  const rdsSocket = GetRdsSocket();
  return {
    connectionTime,//连接时间
    connectionSite: rdsSocket ? (/real/.test(rdsSocket.url) ? '实时站点' : '延时站点') : '',  //连接站点
    connectionStatus: rdsSocket ? rdsSocket.readyState : 2        //连接状态
  }
}

// 日志开关
export function SetLogOn(enable) {
  return allLogData
}

// 查询SDK版本号
export function GetVersion() {
  return {
    v: "v1.0.0"
  }
}

// 设置连接状态回调
export function SetConnectionStatusCallback(callback) {
  connectionStatusCallback = callback
}

export { SetWebSocketMessageCallback, isPro }
