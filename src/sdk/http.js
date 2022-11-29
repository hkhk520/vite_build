import axios from 'axios'
function http(channel, url, body) {
  switch (channel) {
    case 'cloudapi':
      axios.defaults.baseURL = import.meta.env.DEV ? '/northSouthTrack' : 'https://cloudApiuat.iqdii.com/'
      break
    case 'jybdata':
      axios.defaults.baseURL = import.meta.env.DEV ? '/api' : 'https://gtj-data.iqdii.com' 
      break
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
