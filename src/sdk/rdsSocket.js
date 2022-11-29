import encryption from './encryption'
import qs from 'qs'
import getVerify from './verify'

// 保存全局的 rdsSocket 对象
let rdsSocket = null

// 连接站点 的 open 时间
let startTime

/**
 * @name: linkPerfectSite 连接最优站点函数
 * @desc: 取分数score最高的站点连接
 * @param: allRdsSite: 所有站点数组   scoreArr：分数数组
 */
async function linkPerfectSite(allRdsSite, scoreArr) {
  for (const item of allRdsSite) {
    closeRdsSocket();
    await createResWebSocket(item.domain);

    const sitespeedVerify = getVerify();
    /* 测速参数： */
    const sitespeedParams = {
      stype: 1,  //查询
      verify: sitespeedVerify,
      url: "pkgtype=sitespeed"
    }
    // 发起测速
    await rdsRequest(sitespeedParams);

    const gssrVerify = getVerify();
    const rsptime = new Date().getTime() - startTime;
    /* 测速结果参数： */
    const params = {
      stype: 1, // 请求类型（1=查询，2=订阅，3=取消订阅）
      verify: gssrVerify,   //标识码
      url: `pkgtype=gssr&rsptime=${rsptime}`
    }
    // 发起测速结果
    const { stext } = await rdsRequest(params);

    // 保存测速的分数
    scoreArr.push(stext.data.score)
  }

  // 获取分数最高的index
  const maxIndex = scoreArr.indexOf(Math.max.apply(Math, scoreArr))

  // 连接分数最高的站点
  const currentRdsSite = allRdsSite[maxIndex].domain;
  closeRdsSocket();
  await createResWebSocket(currentRdsSite);
  return currentRdsSite;
}

/**
 * @name: optimalSite
 * @desc: 客户登录 或 匿名登录 
 * @param: loginReal: true 客户登录 false 匿名登录   hkRealFlag: 港股实时和延时标志   usRealFlag: 美股实时和延时标志
 */
async function optimalSite(loginReal, hkRealFlag, usRealFlag) {  // real: 实时站点标志
  if (rdsSocket) { // 先断开已经连接的站点
    rdsSocket.close();
    rdsSocket = null;
  }

  // 获取所有的站点
  // const res = await http('jyb', '/jybapp/other/servers')  // 初始化查询所有服务和站点
  // console.log(res);
  const { data } = {
    "result": 1,
    "msg": "查询成功",
    "data": {
      "cloudapi": "https://cloudapi.iqdii.com",
      "jybdata": "http://jybdata.iqdii.com",
      "rdsreal": [
        {
          "name": "rdsws",
          "domain": "wss://rdswsuat.iqdii.com/BQreal/rds_ws"
        },
        {
          "name": "rdswscn",
          "domain": "wss://rdswsuat.iqdii.com/BQreal/rds_ws"
        },
        {
          "name": "rdswshk",
          "domain": "wss://rdswsuat.iqdii.com/BQreal/rds_ws"
        }
      ],
      "rdsdelay": [
        {
          "name": "rdsws",
          "domain": "wss://rdswsuat.iqdii.com/BQdelay/rds_ws"
        },
        {
          "name": "rdswscn",
          "domain": "wss://rdswsuat.iqdii.com/BQdelay/rds_ws"
        },
        {
          "name": "rdswshk",
          "domain": "wss://rdswsuat.iqdii.com/BQdelay/rds_ws"
        }
      ],
      "rdsfulltick": [
        {
          "name": "rdsws",
          "domain": "wss://rdswsuat.iqdii.com/BQfulltick/rds_ws"
        },
        {
          "name": "rdswscn",
          "domain": "wss://rdswsuat.iqdii.com/BQfulltick/rds_ws"
        },
        {
          "name": "rdswshk",
          "domain": "wss://rdswsuat.iqdii.com/BQfulltick/rds_ws"
        }
      ],
      "rdsreal_usdelay": [
        {
          "name": "rdsws",
          "domain": "wss://rdswsuat.iqdii.com/BQreal_usdelay/rds_ws"
        },
        {
          "name": "rdswscn",
          "domain": "wss://rdswsuat.iqdii.com/BQreal_usdelay/rds_ws"
        },
        {
          "name": "rdswshk",
          "domain": "wss://rdswsuat.iqdii.com/BQreal_usdelay/rds_ws"
        }
      ],
      "rdsdelay_usdelay": [
        {
          "name": "rdsws",
          "domain": "wss://rdswsuat.iqdii.com/BQreal/rds_ws"
        },
        {
          "name": "rdswscn",
          "domain": "wss://rdswsuat.iqdii.com/BQreal/rds_ws"
        },
        {
          "name": "rdswshk",
          "domain": "wss://rdswsuat.iqdii.com/BQreal/rds_ws"
        }
        // {
        //   "name": "rdsws",
        //   "domain": "wss://rdswsuat.iqdii.com/BQdelay_usdelay/rds_ws"
        // },
        // {
        //   "name": "rdswscn",
        //   "domain": "wss://rdswsuat.iqdii.com/BQdelay_usdelay/rds_ws"
        // },
        // {
        //   "name": "rdswshk",
        //   "domain": "wss://rdswsuat.iqdii.com/BQdelay_usdelay/rds_ws"
        // }
      ]
    }
  }

  let currentRdsSite

  if (loginReal) {  // 客户登录
    let allRdsSite   // 保存所有过滤出来的站点
    let scoreArr = []

    if (hkRealFlag) {
      switch (usRealFlag) {
        case true:    // 港股和美股实时
          allRdsSite = data.rdsreal;
          // 连接最优站点
          currentRdsSite = await linkPerfectSite(allRdsSite, scoreArr)
          break
        case false:   // 港股实时和美股延时
          allRdsSite = data.rdsreal_usdelay;
          // 连接最优站点
          currentRdsSite = await linkPerfectSite(allRdsSite, scoreArr)
          break
      }
    } else {
      switch (usRealFlag) {
        case true:    // 港股延时和美股实时
          allRdsSite = data.rdsdelay;
          // 连接最优站点
          currentRdsSite = await linkPerfectSite(allRdsSite, scoreArr)
          break
        case false:   // 港股和美股延时
          allRdsSite = data.rdsdelay_usdelay;
          // 连接最优站点
          currentRdsSite = await linkPerfectSite(allRdsSite, scoreArr)
          break
      }
    }
  } else {  // 匿名登录
    // 延时 站点处理

    const allRdsSite = data.rdsdelay_usdelay;  // 保存港股延时和美股延时的所有的站点
    const scoreArr = [];  // 保存所有站点的测速分数

    // 连接最优站点
    currentRdsSite = await linkPerfectSite(allRdsSite, scoreArr)
  }

  return currentRdsSite;
}

// 建立websocket连接
export function createResWebSocket(socketUrl) {
  rdsSocket = new WebSocket(socketUrl)

  return new Promise((resolve, reject) => {
    let socketText = '延时站点'
    if (/real/.test(socketUrl)) socketText = '实时站点'

    rdsSocket.addEventListener('open', function (event) {
      startTime = new Date().getTime()
      console.log(`rdsSocket连接${socketText}成功 =>`, event.currentTarget.readyState)
      resolve(event, rdsSocket)
    })
    rdsSocket.addEventListener('close', function (event) {
      console.log(`RDS 断开${socketText}连接`)
    })
    rdsSocket.addEventListener('error', function (event) {
      console.log('WebSocket连接发生错误')
      reject(event)
    })
  })
}

async function rdsRequest(json) {
  if (!rdsSocket) return { result: 0, msg: '请先登录' }

  const stext = json.url;
  const stype = json.stype;
  const verify = json.verify;
  const session = json.session;  // 登录 uil 获取的 session

  let pkgtype = '';
  const stextParse = qs.parse(stext);
  for (const key in stextParse) {
    if (key.indexOf('pkgtype') != -1) pkgtype = stextParse[key]  // 取到对应的协议
  }

  const { hashCode } = encryption(pkgtype, verify);
  const security = hashCode;  // 生成加密的 security

  const res = await subscribeRdsSend(stext, stype, session, verify, security)

  return res
}
async function subscribeRdsSend(stext, stype, session, verify, security) {
  // 添加到队列 后续再说
  const pkgobj = {
    stype,
    session, // 登录 uil 获取到的session
    verify,
    stext,
    security
  }

  switch (rdsSocket.readyState) {
    // CONNECTING：值为0，表示正在连接。
    case 0:
      rdsSocket.addEventListener('open', function (event) {
        rdsSocket.send(JSON.stringify(pkgobj))
      })
      break
    // OPEN：值为1，表示连接成功，可以通信了。
    case 1:
      rdsSocket.send(JSON.stringify(pkgobj))
      break
    // CLOSING：值为2，表示连接正在关闭。
    case 2:
      break
    // CLOSED：值为3，表示连接已经关闭，或者打开连接失败。
    case 3:
      break
    default:
      break
  }

  return new Promise((resolve, reject) => {
    rdsSocket.addEventListener('message', function rdsDeal(event) {
      const data = JSON.parse(event.data)
      data.rdsSocket = rdsSocket
      resolve(data)
      rdsSocket.removeEventListener('message', rdsDeal)
    })
  })
}

// 关闭 rds 连接
function closeRdsSocket() {
  if (!rdsSocket) {
    return { result: 0, msg: '请先登录' }
  }
  rdsSocket.close()
  const readyState = rdsSocket.readyState
  rdsSocket = null
  return readyState
}

// 获取 rdsSocket
function GetRdsSocket() {
  if (!rdsSocket) {
    return { result: 0, msg: '请先登录' }
  }
  return rdsSocket
}

export {
  rdsRequest,
  closeRdsSocket,
  GetRdsSocket,
  optimalSite
}