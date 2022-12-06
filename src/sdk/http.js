import axios from 'axios'
function http(domainPrefix, url, body) {
  // 加上域名前缀
  if (domainPrefix.pro) {
    axios.defaults.baseURL = import.meta.env.DEV ? domainPrefix.dev : domainPrefix.pro
  } else {
    // /jybapp/other/servers 执行的逻辑
    axios.defaults.baseURL = import.meta.env.DEV ? '/api' : 'https://gtjuat-data.iqdii.com/'
  }

  return new Promise((resolve, reject) => {
    let promise
    if (body) {
      promise = axios.post(url, body)
    } else {
      promise = axios.get(url)
    }
    promise
      .then(res => {
        // resolve(res.data)
        if (res.data.result == 1) {
          resolve({
            result: res.data.result,
            msg: res.data.msg ? res.data.msg : '',
            data: res.data.data ? res.data.data : ''
          })
        } else {
          resolve({
            result: res.data.result, 
            msg: res.data.msg ? res.data.msg : ''
          });
        }
      })
      .catch(() => { })
  })
}
export default http
