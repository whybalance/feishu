// @see https://docs.aircode.io/guide/functions/
const aircode = require('aircode');
const axios = require('axios');
const { log }=require('console');

// 从环境变量中获取飞书机器人的 App ID 和 App Secret
const feishuAppId = process.env.feishuAppId;
const feishuAppSecret = process.env.feishuAppSecret;

// 获取飞书 tenant_access_token 的方法
const getTenantToken = async () => {
  const url =
    'https://open.feishu.cn/open-apis/v3/auth/tenant_access_token/internal/';
  const res = await axios.post(url, {
    app_id: feishuAppId,
    app_secret: feishuAppSecret,
  });
  return res.data.tenant_access_token;
};

// 用飞书机器人回复用户消息的方法
const feishuReply = async (objs) => {
  const tenantToken = await getTenantToken();
  const url = `https://open.feishu.cn/open-apis/im/v1/messages/${objs.msgId}/reply`;
  let content = objs.content;

  // 实现 at 用户能力
  if (objs.openId) content = `<at user_id="${objs.openId}"></at> ${content}`;
  const res = await axios({
    url,
    method: 'post',
    headers: { Authorization: `Bearer ${tenantToken}` },
    data: { msg_type: 'text', content: JSON.stringify({ text: content }) },
  });
  return res.data.data;
};


// 假设data为回调过来的事件体原始内容。
async function group_member_greet(data) {
		console.log(data)
    if (data.header.event_type !== 'im.chat.member.user.added_v1') {
        // 不是用户进群事件则忽略。
        return
    }
    // 在事件中获取用户 open_id。
    const users_info = data.event.users.map(x=>`<at id=${x.user_id.open_id}></at>`).join("")
    // 构造欢迎消息。
    const card = `{
		  "header": {
		    "title": {
		      "tag": "lark_md",
		      "i18n": {
		        "zh_cn": "欢迎新同学"
		      }
		    }
		  },
		  "i18n_elements": {
		    "zh_cn": [
		      {
		        "tag": "div",
		        "fields": [
		          {
		            "is_short": false,
		            "text": {
		              "tag": "lark_md",
		              "content": "亲爱的${users_info}，欢迎入群！👏🏻"
		            }
		          }
		        ]
		      }
		    ]
		  }
		}`
    try {
        // 调用发送消息 OpenAPI。
        const resp = await axios.post("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
            receive_id: `"${data.event.chat_id}"`,
            msg_type: "interactive",
            content: `"${JSON.stringify({card})}"`
					})
			
	      console.log(resp)  
        return {
            code: resp.data.code,
            msg: resp.data.msg
        }
    } catch(e) {
        return {
            code: -1,
            msg: "${e}"
        }
    } 
}

// 飞书入口函数
module.exports = async function (params, context) {
	console.log(params)
  // 判断是否开启了事件 Encrypt Key，如果开启提示错误
  if (params.encrypt)
    return { error: '请在飞书机器人配置中移除 Encrypt Key。' };

  // 用来做飞书接口校验，飞书接口要求有 challenge 参数时需直接返回
  if (params.challenge) return { challenge: params.challenge };

	const filesTable = aircode.db.table('_files');
	filesTable.save({
		params: JSON.stringify(params)
	});
	
  // 判断是否没有开启事件相关权限，如果没有开启，则返回错误
  if (!params.header || !params.header.event_id) {
    // 判断当前是否为通过 Debug 环境触发
    if (context.trigger === 'DEBUG') {
      return {
        error:
          '如机器人已配置好，请先通过与机器人聊天测试，再使用「Mock by online requests」功能调试。',
      };
    } else {
      return {
        error:
          '请参考教程配置好飞书机器人的事件权限，相关权限需发布机器人后才能生效。',
      };
    }
  }

	
	const data = params

	if (data.header.event_type !== 'im.chat.member.user.added_v1') {
			// 不是用户进群事件则忽略。
			return
	}
	// 在事件中获取用户 open_id。
	const users_info = data.event.users.map(x=>`<at id=${x.user_id.open_id}></at>`).join("")
	const contentsTable = aircode.db.table('contents');

	// 构造欢迎消息。
	const card = `{
		"header": {
			"title": {
				"tag": "lark_md",
				"i18n": {
					"zh_cn": "欢迎新同学"
				}
			}
		},
		"i18n_elements": {
			"zh_cn": [
				{
					"tag": "div",
					"fields": [
						{
							"is_short": false,
							"text": {
								"tag": "lark_md",
								"content": "亲爱的${users_info}，欢迎入群！👏🏻"
							}
						}
					]
				}
			]
		}
	}`
		try {
				// 调用发送消息 OpenAPI。
				contentsTable.save({
						receive_id: "${data.event.chat_id}",
						msg_type: "interactive",
						contents: "${JSON.stringify({card})}",
				});
			
				const resp = await axios.post("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
						receive_id: "${data.event.chat_id}",
						msg_type: "interactive",
						content: "${JSON.stringify({card})}",
				})
				contentsTable.save({
					contents: JSON.stringify(resp)
				});
				return {
						code: resp.data.code,
						msg: resp.data.msg
				}
		} catch(e) {
				contentsTable.save({
					contents: '返回值错误！'
				});
				return {
						code: -1,
						msg: "${e}"
				}
		} 
	
};