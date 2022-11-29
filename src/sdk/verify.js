
export default function () {
  const timestamp = new Date().getTime();
  const verify = timestamp + `${Math.random() * 100000}`.slice(0, 5);
  return verify
}