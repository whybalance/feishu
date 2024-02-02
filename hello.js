// @see https://docs.aircode.io/guide/functions/
const aircode = require('aircode');
const axios = require('axios');
const { log }=require('console');

// 从环境变量中获取飞书机器人的 App ID 和 App Secret
const feishuAppId = process.env.feishuAppId;
const feishuAppSecret = process.env.feishuAppSecret;
const Authorization = process.env.Authorization;


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
	const tenantToken = await getTenantToken();

	// 构造欢迎消息。
	const card = {
			"card" : {
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
									"content": "亲爱的" + users_info+"，欢迎入群！👏🏻"
								}
							}
						]
					}
				]
			}
		} 
	}

	const elements = {
		"elements": [
		  {
			"tag": "div",
			"text": {
			  "content": "**🌟 千人千面** | 满足企业管理、文化宣传、知识管理、效率提升等各类需求\n\n**📲 多端定制** | 适配桌面端、移动端、iPad端使用习惯，打造最佳使用体验\n\n**🎉 丰富多元** | 灵活的通用组件、全面的开发能力，轻松搭建个性化工作台\n",
			  "tag": "lark_md"
			}
		  },
		  {
			"alt": {
			  "content": "",
			  "tag": "plain_text"
			},
			"img_key": "img_v2_9b14e850-3757-43ae-96b4-965ed81e7f8g",
			"tag": "img"
		  },
		  {
			"tag": "hr"
		  },
		  {
			"tag": "action",
			"actions": [
			  {
				"tag": "button",
				"text": {
				  "tag": "plain_text",
				  "content": "了解定制工作台详情"
				},
				"type": "primary",
				"url": "https://bytedance.feishu.cn/docx/doxcn8ZCcCeHu4nneLNNncSQEkd"
			  },
			  {
				"tag": "button",
				"text": {
				  "content": "立即开启体验",
				  "tag": "plain_text"
				},
				"type": "default",
				"url": "https://www.feishu.cn/admin/appcenter/portal"
			  }
			]
		  }
		],
		"header": {
		  "template": "blue",
		  "title": {
			"content": "🔥 定制工作台，搭建好看又好用的企业门户",
			"tag": "plain_text"
		  }
		}
  }
	
		try {
				// 调用发送消息 OpenAPI。
				contentsTable.save({
						receive_id: `${data.event.chat_id}`,
            msg_type: "interactive",
            contents: JSON.stringify(elements)
				});
			
				const resp = await axios.post("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
            receive_id: `${data.event.chat_id}`,
            msg_type: "interactive",
            content: JSON.stringify(elements)
					},{
				    headers: {
							"Authorization":  `Bearer ${tenantToken}`,
				      'Content-Type': "application/json; charset=utf-8"
				    }
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