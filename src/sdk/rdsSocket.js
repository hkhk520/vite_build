import encryption from './encryption'
import qs from 'qs'
import getVerify from './verify'

// 保存全局的 rdsSocket 对象
let rdsSocket = null

// 连接站点 的 open 时间
let startTime

// 心跳存活的最后时间
let lastAliveTime = null

let webSocketMessageCallback = function (message) { }

/**
 * @name: linkPerfectSite 连接最优站点函数
 * @desc: 取分数score最高的站点连接
 * @param: allRdsSite: 所有站点数组   
 */
export async function linkPerfectSite(allRdsSite) {
  const scoreArr = [];      // scoreArr：分数数组
  const availableRdsSite = [];   // 保存可用的所有站点

  for (const item of allRdsSite) {
    closeRdsSocket();
    try {
      await createResWebSocket(item.domain);
    } catch (error) {
      // 本次站点连不上，直接跳出本次循环
      continue;
    }

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
    scoreArr.push(stext.data.score);
    // 保存可用的站点
    availableRdsSite.push(item);
  }

  // 获取分数最高的index
  const maxIndex = scoreArr.indexOf(Math.max.apply(Math, scoreArr))

  if (availableRdsSite.length == 0) return

  // 连接分数最高的站点
  const currentRdsSite = availableRdsSite[maxIndex]?.domain;
  closeRdsSocket();
  await createResWebSocket(currentRdsSite);
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
    rdsSocket.addEventListener('message', function rdsDeal(event) {
      // 2s更新一次心跳存活的最后时间
      lastAliveTime = new Date().getTime();

      // webcoket 响应回来的是二进制的处理逻辑
      if (event.data instanceof Blob) {
        const file = new FileReader();
        file.onload = function (res) { // 这里的this是file
          const dataView = new DataView(this.result);
          // const length = dataView.getInt32(0, true);
          const type = dataView.getInt16(4, true);
          const id = dataView.getInt16(6, true);
          console.log(type, id);

          // type == 32000 webcoket 服务控制ID
          if (type == 32000) {
            if (id == 1) {
              const str = String.fromCharCode.apply(null, new Uint8Array(this.result, 8));

              // 需要关闭连接，并且不自动重连
              closeRdsSocket();

              webSocketMessageCallback(str);
            } else if (id == 1000) {
              // 服务包变化，重新查询最新服务包，重连
              setLastAliveTime()
            }
          }
        }

        // 用于启动读取指定的 Blob 或 File 内容
        file.readAsArrayBuffer(event.data)
      } else {
        // webcoket 响应回来的是字符串的处理逻辑
        webSocketMessageCallback(event.data)
      }
    })
  })
}

async function rdsRequest(json) {
  if (!rdsSocket) return { result: 0, msg: '请先登录' }

  const stext = json.url;
  const stype = json.stype;
  const verify = json.verify;
  const session = json.session;  // 登录 jyb 获取的 session
  const servicepkg = json.servicepkg;

  /* 取到对应的协议 start */
  let pkgtype = '';
  const stextParse = qs.parse(stext);
  for (const key in stextParse) {
    if (key.includes('pkgtype')) {
      pkgtype = stextParse[key]
      break;
    }
  }
  /* 取到对应的协议 end */

  const { hashCode } = encryption(pkgtype, verify);
  const security = hashCode;  // 生成加密的 security

  const res = await subscribeRdsSend(stext, stype, session, verify, security, servicepkg)

  return res
}
async function subscribeRdsSend(stext, stype, session, verify, security, servicepkg) {
  // 添加到队列 后续再说
  const pkgobj = {
    stype,
    session, // 登录 uil 获取到的session
    verify,
    stext,
    security,
    servicepkg
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
      if (verify === data.verify) {
        resolve(data)
        rdsSocket.removeEventListener('message', rdsDeal)
      }
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
    return false
  }
  return rdsSocket
}

// WebSocketMessage注册回调函数
export function SetWebSocketMessageCallback(callback) {
  webSocketMessageCallback = callback
}

function setLastAliveTime() {
  // 心跳存活时间置空
  lastAliveTime = null
}

export {
  rdsRequest,
  closeRdsSocket,
  GetRdsSocket,
  lastAliveTime,
  setLastAliveTime
}