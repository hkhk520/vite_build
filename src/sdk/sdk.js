import { rdsRequest, closeRdsSocket, GetRdsSocket, optimalSite, createResWebSocket } from "./rdsSocket"
import http from "./http"
import dayjs from 'dayjs'
import md5 from 'md5'
import { useNetwork } from '@vueuse/core'
import getVerify from './verify'

let loginSession  // 第三方登录/jybapp/login/3rd-login的session
let loginUid
let rdsSession    // 保存 uil 登录后的 session
let connectionTime  // 连接rds的时间
let currentRdsSite  // 当前的最优站点
let globalTerminal
let globalUserName

export { GetRdsSocket }

/**
 * @name: Login    /jybapp/login/3rd-login
 * @desc: 登录 采用第三方登录 /jybapp/login/3rd-login
 * @param: 
 */
export async function Login(userName, session, ipAddress, remark, appVer, appKey, terminal) {
  globalTerminal = terminal;
  globalUserName = userName;
  // await SendHttpRequest('jybdata', '/jybapp/other/servers')  // 初始化查询所有服务和站点

  // 游客登录执行的逻辑 
  if (userName == 'Anonymous') {
    const { effectiveType } = useNetwork()
    const body = {
      org: 'org_gtj_mob',
      version: '6.0',
      network: effectiveType.value,
      ver: '8.1.0',
      lang: 'chs'
    }
    const res = await SendHttpRequest('jybdata', '/jybapp/login/anonymous-login', body);

    if (res.result == 1) {
      const { data, result, msg } = res;
      loginSession = data.session;

      // 未登录时，先连接延时站点
      currentRdsSite = await optimalSite(false, false, false);  // 选择最优站点连接

      // 最优站点连接后，开始匿名登录WebSocket
      const uilParams = {
        stype: 0,
        url: `pkgtype=uil&passtype=200&terminal=web&username=AnyBmp&password=any&ibrokerid=0`
      }
      const { stext } = await rdsRequest(uilParams);
      rdsSession = stext.data.uinfo.session;
      connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

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
        msg
      }
    } else {
      return res
    }
  } else {  // 客户登录逻辑
    const _3rd_uid = 'GTJ.700109';
    const org = _3rd_uid.split('.')[0]
    const uid = _3rd_uid.split('.')[1]
    // 加密
    const _3rd_token = md5(`${org.toLowerCase()}.${uid}`)

    const body = {
      _3rd_uid,  // 必传
      _3rd_token,    // 必传
      _3rd_type: 'trade',   // 必传  登录类型
      unionid: '',
      source: 'Web',
      userName,
    }
    const res = await SendHttpRequest('jybdata', '/jybapp/login/3rd-login', body);

    if (res.result == 1) {
      const { data, result, msg } = res;
      loginSession = data.session;
      loginUid = data.uid;

      const hkReal = ['30200', '30230', '30300', '30310']
      const usReal = ['30700 ', '30710']
      // const resss = await SendHttpRequest('jybdata', '/jybapp/login/base-login', { userName: 't9devin', password: '123456', source: 'web' })
      // loginSession = resss.data.session;
      // loginUid = resss.data.uid;

      const { data: { list: userAllPower } } = await SendHttpRequest('jybdata', '/jybapp/user/UserAllPower');
      let hkRealFlag = false
      let usRealFlag = false
      for (const item of userAllPower) {
        if (hkReal.includes(item.PackageCode)) hkRealFlag = true;
        if (usReal.includes(item.PackageCode)) usRealFlag = true;
      }

      // 连接 最优的 实时 站点
      currentRdsSite = await optimalSite(true, hkRealFlag, usRealFlag)

      const uilParams = {
        stype: 0,
        // passtype=200    password=loginSession
        url: `pkgtype=uil&passtype=200&terminal=${terminal}&username=${userName}&password=${loginSession}&ibrokerid=0`
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
        msg
      }
    } else {
      return res
    }
  }
}

// 获取授权
export function GetAuthorizedInfo() {
  if (!loginSession && !rdsSession) {
    return { result: 0, msg: '请先登录' }
  }

  const data = {
    loginSession,   // 交易宝第三方登录的session
    rdsSession,     // rds登录的session
    loginUid,       // 交易宝第三方登录的uid
    terminal: globalTerminal,
    currentRdsSite,  // 当前最优的站点
    userName: globalUserName
  }
  return {
    result: 1,
    authorizedInfo: window.btoa(JSON.stringify(data))
  }
}

// 认证， 用于建立二次连接
export async function Authentication(payload) {
  let authorizedInfo
  try {
    authorizedInfo = window.atob(payload);
  } catch (err) {
    if (/The string to be decoded is not correctly encoded/.test(err)) return { result: 0, msg: 'authorizedInfo 错误' }
  }
  authorizedInfo = JSON.parse(authorizedInfo);
  loginSession = authorizedInfo.loginSession;
  currentRdsSite = authorizedInfo.currentRdsSite;
  rdsSession = authorizedInfo.rdsSession;
  loginUid = authorizedInfo.loginUid ? authorizedInfo.loginUid : '';
  globalTerminal = authorizedInfo.terminal;
  globalUserName = authorizedInfo.userName;

  // 创建WebSocket
  await createResWebSocket(currentRdsSite);
  
  // 该登录接口不会互踢
  const slalParams = {
    stype: 0,   // 0:登录  4:退出
    verify: getVerify(),//标识码,说明：客户端使用, 服务端原样返回
    url: `pkgtype=slal&org=GTJ&uid=${loginUid}&uidtype=7&terminal=${authorizedInfo.terminal}&ibrokerid=0`
  }
  console.log(slalParams);
  const response = await SendWebSocketAsyncRequest(slalParams)
  connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
  const statusid = response.stext.data.statusid;
  if (response.stext.result == 1) {
    if (statusid == 3 || statusid == 2) {
      return { result: 1, msg: '连接成功' }
    } else {
      // session已过期，
      return { result: -1000, msg: 'session失效' }
    }
  } else {
    return { result: -1000, msg: 'session失效' }
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
  if (!url.includes('login')) {
    if (body) {
      body.session = loginSession;
      body.uid = loginUid;
    } else {
      url += /\?/.test(url) ? `&uid=${loginUid}&session=${loginSession}` : `?uid=${loginUid}&session=${loginSession}`
    }
  }
  return http(channel, url, body)
}

// 退出登录
export async function Logout() {
  const readyState = closeRdsSocket()  // 关闭rds
  if (typeof readyState != 'number') {
    return { result: 0, msg: '请先登录' }
  }
  // const slalParams = {
  //   stype: 4,   // 0:登录  4:退出
  //   verify: getVerify(),//标识码,说明：客户端使用, 服务端原样返回
  //   url: `pkgtype=slal&org=GTJ&uid=${loginUid}&uidtype=7&terminal=${globalTerminal}&ibrokerid=0`
  // }
  // const response = await sendWebSocketAsyncRequest(slalParams)
  // connectionTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
  const httpRes = await SendHttpRequest('jybdata', `/jybapp/login/logout`)
  return {
    readyState,
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
  return {
    apiUrl: '/ybapp/F10Service/GetBriefCompanyIntroduction',
    log: '示例，待开放'
  }
}

// 查询SDK版本号
export function GetVersion() {
  return {
    v: "v1.0.0"
  }
}