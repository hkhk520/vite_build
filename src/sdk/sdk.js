import { rdsRequest, closeRdsSocket, GetRdsSocket, linkPerfectSite, createResWebSocket } from "./rdsSocket"
import http from "./http"
import dayjs from 'dayjs'
import { useNetwork } from '@vueuse/core'
import getVerify from './verify'

let jybSession  // 登录/jybapp/login/GetUserInfo的session
let jybUid      // 登录/jybapp/login/GetUserInfo的uid
let rdsSession    // 保存 uil 登录后的 session
let connectionTime  // 连接rds的时间
let currentRdsSite  // 当前的最优站点
let globalTerminal
let globalUserName
let globalUserSession   // 券商Login传过来的session
let allLogData = []      // 保存全部日志信息
let jybdata = ''   // 保存当前的jyb域名
let cloudapi = ''   // 保存当前的cloudapi域名
const { effectiveType } = useNetwork();

export { GetRdsSocket }

/**
 * @name: Login    /jybapp/login/GetUserInfo
 * @desc: 登录 /jybapp/login/GetUserInfo
 * @param: 
 */
export async function Login(userName, session, ipAddress, remark, appVer, appKey, terminal) {
  globalTerminal = terminal;
  if (userName === 'Anonymous') userName = ''
  globalUserName = userName;
  globalUserSession = session;

  // 查询域名
  const { data } = await SendHttpRequest('jybdata', `/jybapp/other/servers?org=org_gtj_mob&version=6.0&network=${effectiveType.value}&ver=7.1.0&lang=chs`)
  jybdata = data.jybdata;
  cloudapi = data.cloudapi;

  // 初始化查询所有服务和站点
  const res = await SendHttpRequest('jybdata', `/jybapp/login/GetUserInfo?session=${session}&org=org_gtj_mob&version=1.0&network=${effectiveType.value}&ver=${appVer}&lang=chs`, { userName, ipAddress, appKey, terminal })

  if (res.result == 1) {
    const { data, result } = res;

    jybSession = data.session ? data.session : '';  // 匿名、客户登录 都有返回
    jybUid = data.uid ? data.uid : '';  // 客户登录 才有返回
    const allRdsSite = data.rds_servers; // 匿名、客户登录 都有返回

    // 连接 最优的 实时 站点
    currentRdsSite = await linkPerfectSite(allRdsSite);

    let url
    if (userName == 'Anonymous') {  // 匿名登录
      url = `pkgtype=uil&passtype=3&terminal=${terminal}&username=AnyBmp&password=any&ibrokerid=0`
    } else {  // 用户登录
      // passtype=200    password=jybSession
      url = `pkgtype=uil&passtype=200&terminal=${terminal}&username=${userName}&password=${jybSession}&ibrokerid=0`
    }
    const uilParams = {
      stype: 0,
      url
    }
    const { stext } = await rdsRequest(uilParams)
    rdsSession = stext.data.uinfo.session;
    connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss')

    // rds的登录失败判断
    if (stext.result == 1) {
      if (stext.data.statusid != 0) {
        return { result: 0, msg: 'rds登录失败' }
      }
    } else {
      return { result: 0, msg: 'rds登录失败' }
    }

    return {
      result,
      msg: '登录成功'
    }
  } else {
    return res
  }
}

// 获取授权
export function GetAuthorizedInfo() {
  if (!jybSession && !rdsSession) {
    const res = { result: 0, msg: '请先登录' }
    allLogData.push({
      time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      ...res
    })
    return res
  }

  const data = {
    jybSession,   // 交易宝第三方登录的session
    rdsSession,     // rds登录的session
    jybUid,       // 交易宝第三方登录的uid
    terminal: globalTerminal,
    currentRdsSite,  // 当前最优的站点
    userName: globalUserName,
    userSession: globalUserSession  // 券商传过来的session
  }
  allLogData.push({
    time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    result: 1,
    msg: '获取授权成功'
  })
  return {
    result: 1,
    authorizedInfo: window.btoa(JSON.stringify(data))
  }
}

/**
 * @name: reconnectionRds   
 * @desc: 重新查询服务包返回的站点，重新最优连接rds
 * @param: rdsSite：当前的默认站点, reload：true = 当前的默认站点连不上  false = 判断是否服务包变化了
 */
async function reconnectionRds(jybUid, globalUserSession, globalUserName, globalTerminal, rdsSite, reload) {
  // 查询服务包所有站点
  const res = await SendHttpRequest('jybdata', `/jybapp/config/getserverlist?uid=${jybUid}&org=org_gtj_mob&network=${effectiveType.value}&ver=8.1.55&lang=chs`);

  if (res.result == 1) {
    const { data, result } = res;

    const allRdsSite = data.rds_servers; // 相关权限的站点

    if (!reload) {
      // 判断是否服务包变化了
      const siteFlag = allRdsSite.some(function (item) {
        if (item.domain === rdsSite) return true
      })

      // 存在当前站点，服务包没有变，不需要重新选站
      if (siteFlag) return true;
    }

    // 连接 最优的 实时 站点
    currentRdsSite = await linkPerfectSite(allRdsSite);

    let url
    if (globalUserName == 'Anonymous') {  // 匿名登录
      url = `pkgtype=uil&passtype=3&terminal=${globalTerminal}&username=AnyBmp&password=any&ibrokerid=0`
    } else {  // 用户登录
      // passtype=200    password=jybSession
      url = `pkgtype=uil&passtype=200&terminal=${globalTerminal}&username=${globalUserName}&password=${globalUserSession}&ibrokerid=0`
    }
    const uilParams = {
      stype: 0,
      url
    }
    const { stext } = await rdsRequest(uilParams)
    rdsSession = stext.data.uinfo.session;
    connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss')

    // rds的登录失败判断
    if (stext.result == 1) {
      if (stext.data.statusid != 0) {
        return { result: 0, msg: '登录失败' }
      }
    } else {
      return { result: 0, msg: '登录失败' }
    }

    return {
      result,
      msg: '登录成功'
    }
  } else {
    return res
  }
}

// 认证， 用于建立二次连接
export async function Authentication(payload) {
  let authorizedInfo
  try {
    authorizedInfo = window.atob(payload);
    authorizedInfo = JSON.parse(authorizedInfo);
  } catch (err) {
    if (/The string to be decoded is not correctly encoded/.test(err)) {
      const res = { result: 0, msg: 'authorizedInfo 错误' }
      allLogData.push({
        time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        ...res
      })
      return res
    } else {
      return { result: 0, msg: err }
    }
  }
  jybSession = authorizedInfo.jybSession;
  currentRdsSite = authorizedInfo.currentRdsSite;
  rdsSession = authorizedInfo.rdsSession;
  jybUid = authorizedInfo.jybUid ? authorizedInfo.jybUid : '';
  globalTerminal = authorizedInfo.terminal;
  globalUserName = authorizedInfo.userName;
  globalUserSession = authorizedInfo.userSession;

  try {
    // 创建WebSocket
    await createResWebSocket(currentRdsSite);
  } catch (error) {
    // 本次站点连不上，重新获取所有站点，并测速连接最优站点，并终止下面的代码
    return await reconnectionRds(jybUid, globalUserSession, globalUserName, globalTerminal, currentRdsSite, true)
  }

  // 该登录接口不会互踢
  const slalParams = {
    stype: 0,   // 0:登录  4:退出
    verify: getVerify(),//标识码,说明：客户端使用, 服务端原样返回
    url: `pkgtype=slal&session=${rdsSession}&org=GTJ&uid=${jybUid}&uidtype=7&terminal=${authorizedInfo.terminal}&ibrokerid=0`
  }
  const response = await SendWebSocketAsyncRequest(slalParams)
  connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

  // 判断服务包是否变化了 利用 setTimeout 来实现先执行下面的代码，setTimeout的代码最后执行
  /* setTimeout(async function () {
    const reconnectionRes = await reconnectionRds(jybUid, globalUserSession, globalUserName, globalTerminal, currentRdsSite, false);
    if (reconnectionRes !== true) {
      return reconnectionRes
    }
  }, 0) */

  // 返回默认站点的连接结果
  const statusid = response.stext.data.statusid;
  if (response.stext.result == 1) {
    if (statusid == 3 || statusid == 2) {
      const res = { result: 1, msg: '连接成功' }
      allLogData.push({
        time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        ...res
      })
      return res
    } else {
      const res = { result: -1, msg: 'authorizedInfo失效，请重新登录' }
      allLogData.push({
        time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        ...res
      })
      return res
    }
  } else {
    const res = { result: -1, msg: 'authorizedInfo失效，请重新登录' }
    allLogData.push({
      time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      ...res
    })
    return res
  }
}

// rds 请求/订阅
export function SendWebSocketAsyncRequest(data) {
  data.session = rdsSession
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
  const httpRes = await SendHttpRequest('jybdata', `/jybapp/login/userlogout?uid=${jybUid}&session=${jybSession}&org=org_gtj_mob&version=1.0&network=${effectiveType.value}&ver=1.0.0&lang=chs`)

  // 退出 rds 登录
  const slalParams = {
    stype: 4,   // 0:登录  4:退出
    verify: getVerify(),//标识码,说明：客户端使用, 服务端原样返回
    url: `pkgtype=slal&org=GTJ&uid=${jybUid}&uidtype=7&terminal=${globalTerminal}&ibrokerid=0`
  }
  await SendWebSocketAsyncRequest(slalParams)
  closeRdsSocket()  // 关闭rds
  connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss')

  // 清空 session 和 uid 
  jybSession = '';
  jybUid = '';
  rdsSession = '';

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