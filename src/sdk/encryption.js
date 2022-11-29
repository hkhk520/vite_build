// pkgtype：协议类型
import md5 from 'md5'
export default (pkgtype, verify) => {
  const dkey = '5dab8163'
  const dstart = 8
  return {
    hashCode: md5(pkgtype.toLowerCase() + dkey + verify).slice(dstart, dstart + 8)  // 添加 security
  }
}
