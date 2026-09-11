const crypto = require('crypto');

/**
 * 计算 mtop sign
 * @param {string} token - _m_h5_tk cookie 中 _ 前面的部分
 * @param {string|object} data - 请求参数 JSON 字符串或对象
 * @param {string} [appKey='12574478'] - appKey
 * @param {number} [timestamp] - 时间戳（毫秒），不传则使用当前时间
 * @returns {{ sign: string, timestamp: number, appKey: string }}
 */
function getMtopSign(token, data, appKey, timestamp) {

    // 处理 data：如果是对象则转为JSON字符串
    if (typeof data === 'object') {
        data = JSON.stringify(data);
    }

    // 提取 token（取 _ 前面的部分）
    if (token.indexOf('_') !== -1) {
        token = token.split('_')[0];
    }

    appKey = appKey || '12574478';
    timestamp = timestamp || Date.now();

    // 构造签名字符串
    const signStr = token + '&' + timestamp + '&' + appKey + '&' + data;

    // MD5 计算
    const sign = crypto.createHash('md5').update(signStr).digest('hex');

    return {
        sign: sign,
        timestamp: timestamp,
        appKey: appKey
    };
}

let token = '51af247626d4e8f2a85c5354e7ec7b03';
let data = '123123123';

let result = getMtopSign(token, data);
console.log(result)


