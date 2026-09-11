const { generateBxParams } = require("./阿里bx/run_bx_ua_local.js");

async function fn() {
  const r = await generateBxParams({
    url: "//h5api.m.taobao.com/h5/mtop.xxx/1.0/?...", // 可选，默认用示例 URL
    record: false,   // 可选，是否录制滑块轨迹
    distance: 210,   // 可选，滑块距离
    timeout: 20000,  // 可选，初始化超时
  });
  return {
    bx_ua: r["bx-ua"],
    "bx-umidtoken": r["bx-umidtoken"],
  };
}
fn()
  .then((res) => console.log(JSON.stringify(res)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
