// ==UserScript==
// @name         RDAP域名信息查询工具
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  使用RDAP协议查询域名注册信息，替代传统WHOIS
// @author       You
// @match        *://*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=rdap.org
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      client.rdap.org
// @connect      data.iana.org
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 添加样式
    GM_addStyle(`
        #rdap-checker-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 5px;
            padding: 15px;
            z-index: 9999;
            box-shadow: 0 0 10px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
            font-size: 14px;
        }
        #rdap-checker-panel h3 {
            margin-top: 0;
            border-bottom: 1px solid #eee;
            padding-bottom: 8px;
        }
        .rdap-input {
            display: flex;
            margin-bottom: 10px;
        }
        .rdap-input input {
            flex-grow: 1;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px 0 0 4px;
        }
        .rdap-input button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 0 4px 4px 0;
            cursor: pointer;
        }
        .result-panel {
            background: #f5f5f5;
            border-radius: 4px;
            padding: 10px;
            max-height: 300px;
            overflow-y: auto;
            margin-top: 10px;
        }
        .result-item {
            margin-bottom: 6px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 6px;
        }
        .result-label {
            font-weight: bold;
        }
        .result-value {
            word-break: break-all;
        }
        .minimize-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            cursor: pointer;
            font-size: 16px;
        }
        .error {
            color: red;
        }
        .success {
            color: green;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 12px;
            background: #f8f8f8;
            padding: 5px;
            max-height: 200px;
            overflow-y: auto;
        }
    `);

    // 创建UI面板
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'rdap-checker-panel';
        panel.innerHTML = `
            <span class="minimize-btn">_</span>
            <h3>RDAP域名信息查询工具</h3>

            <div class="rdap-input">
                <input type="text" id="domain-input" placeholder="输入要查询的域名" value="${getRootDomain(window.location.hostname)}">
                <button id="query-btn">查询</button>
            </div>

            <div id="server-selection" style="margin-bottom: 10px;">
                <div><input type="radio" name="server" id="server-auto" value="auto" checked> <label for="server-auto">自动选择RDAP服务器</label></div>
                <div><input type="radio" name="server" id="server-demo" value="demo"> <label for="server-demo">使用Demo服务器 (client.rdap.org)</label></div>
            </div>

            <div id="result-panel" class="result-panel">
                <div id="result-content">正在自动查询中...</div>
            </div>
        `;
        document.body.appendChild(panel);

        // 添加最小化按钮事件
        panel.querySelector('.minimize-btn').addEventListener('click', function() {
            const content = panel.querySelectorAll('.rdap-input, #server-selection, #result-panel, h3');
            content.forEach(el => {
                el.style.display = el.style.display === 'none' ? 'block' : 'none';
            });
            this.textContent = this.textContent === '_' ? '+' : '_';
        });

        // 添加查询按钮事件
        document.getElementById('query-btn').addEventListener('click', function() {
            performQuery();
        });

        // 自动执行查询
        setTimeout(performQuery, 500);
    }

    // 执行查询
    function performQuery() {
        const domain = document.getElementById('domain-input').value.trim();
        const serverType = document.querySelector('input[name="server"]:checked').value;

        if (!domain) {
            alert('请输入域名');
            return;
        }

        // 获取结果元素
        const resultContent = document.getElementById('result-content');
        resultContent.innerHTML = '<div class="result-item">查询中，请稍候...</div>';

        if (serverType === 'demo') {
            // 使用demo服务器
            queryRdapDirect(domain, resultContent);
        } else {
            // 自动选择服务器
            queryRdapWithServerList(domain, resultContent);
        }
    }

    // 获取根域名（去除www等常见子域名前缀）
    function getRootDomain(hostname) {
        // 常见子域名前缀列表
        const commonSubdomains = ['www', 'ww2', 'm', 'mobile', 'app', 'api'];

        try {
            // 分割域名
            const parts = hostname.split('.');

            // 如果域名部分少于2段，直接返回
            if (parts.length < 2) {
                return hostname;
            }

            // 检查第一段是否为常见子域名前缀
            if (commonSubdomains.includes(parts[0].toLowerCase())) {
                // 去掉第一段，返回剩余部分
                return parts.slice(1).join('.');
            }

            // 否则返回原始域名
            return hostname;
        } catch (e) {
            // 出错时返回原始域名
            return hostname;
        }
    }

    // 使用Demo服务器直接查询
    function queryRdapDirect(domain, resultElement) {
        // 确保使用根域名
        domain = getRootDomain(domain);
        const rdapUrl = `https://client.rdap.org/domain/${domain}`;

        GM_xmlhttpRequest({
            method: 'GET',
            url: rdapUrl,
            onload: function(response) {
                processRdapResponse(response, resultElement);
            },
            onerror: function(error) {
                resultElement.innerHTML = `<div class="result-item error">请求错误: ${error.statusText || '网络错误'}</div>`;
            }
        });
    }

    // 先获取RDAP服务器列表，然后选择合适的服务器查询
    function queryRdapWithServerList(domain, resultElement) {
        // 确保使用根域名
        domain = getRootDomain(domain);

        // 获取IANA的RDAP服务器列表
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://data.iana.org/rdap/dns.json',
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    const services = data.services || [];

                    // 查找适合当前域名的RDAP服务器
                    const tld = domain.split('.').pop();
                    let rdapServer = null;

                    // 遍历服务列表查找匹配的TLD
                    for (const service of services) {
                        const tlds = service[0];
                        const servers = service[1];

                        if (tlds.includes(tld) || tlds.includes('.' + tld)) {
                            rdapServer = servers[0];
                            break;
                        }
                    }

                    if (rdapServer) {
                        // 确保URL以/结尾
                        if (!rdapServer.endsWith('/')) {
                            rdapServer += '/';
                        }

                        const rdapUrl = `${rdapServer}domain/${domain}`;

                        resultElement.innerHTML = `<div class="result-item">找到RDAP服务器: ${rdapServer}<br>正在查询...</div>`;

                        // 使用找到的服务器查询
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: rdapUrl,
                            onload: function(resp) {
                                processRdapResponse(resp, resultElement);
                            },
                            onerror: function(error) {
                                resultElement.innerHTML += `<div class="result-item error">查询错误: ${error.statusText || '网络错误'}</div>`;

                                // 如果自动选择服务器失败，回退到Demo服务器
                                resultElement.innerHTML += `<div class="result-item">尝试使用Demo服务器...</div>`;
                                queryRdapDirect(domain, resultElement);
                            }
                        });
                    } else {
                        resultElement.innerHTML = `<div class="result-item warning">未找到适合域名 ${domain} 的RDAP服务器，尝试使用Demo服务器...</div>`;
                        // 回退到Demo服务器
                        queryRdapDirect(domain, resultElement);
                    }
                } catch (e) {
                    resultElement.innerHTML = `<div class="result-item error">解析服务器列表错误: ${e.message}</div>`;
                    // 回退到Demo服务器
                    queryRdapDirect(domain, resultElement);
                }
            },
            onerror: function() {
                resultElement.innerHTML = `<div class="result-item error">获取RDAP服务器列表失败，尝试使用Demo服务器...</div>`;
                // 回退到Demo服务器
                queryRdapDirect(domain, resultElement);
            }
        });
    }

    // 处理RDAP响应
    function processRdapResponse(response, resultElement) {
        try {
            if (response.status === 200) {
                const data = JSON.parse(response.responseText);
                displayRdapData(data, resultElement);
            } else {
                resultElement.innerHTML = `<div class="result-item error">查询失败: HTTP ${response.status} - ${response.statusText}</div>`;

                try {
                    // 尝试解析错误响应
                    const errorData = JSON.parse(response.responseText);
                    if (errorData.errorCode && errorData.title) {
                        resultElement.innerHTML += `<div class="result-item error">
                            错误代码: ${errorData.errorCode}<br>
                            错误信息: ${errorData.title}
                        </div>`;
                    }
                } catch (e) {
                    // 如果无法解析，显示原始响应
                    if (response.responseText) {
                        resultElement.innerHTML += `<div class="result-item"><pre>${response.responseText}</pre></div>`;
                    }
                }
            }
        } catch (e) {
            resultElement.innerHTML = `<div class="result-item error">处理响应错误: ${e.message}</div>`;
            if (response.responseText) {
                resultElement.innerHTML += `<div class="result-item"><pre>${response.responseText}</pre></div>`;
            }
        }
    }

    // 显示RDAP数据
    function displayRdapData(data, resultElement) {
        // 清空结果区域
        resultElement.innerHTML = '';

        // 基本信息
        let html = `
            <div class="result-item success">查询成功</div>
            <div class="result-item">
                <div class="result-label">域名:</div>
                <div class="result-value">${data.ldhName || data.handle || '未知'}</div>
            </div>
        `;

        // 状态信息
        if (data.status && data.status.length > 0) {
            html += `
                <div class="result-item">
                    <div class="result-label">状态:</div>
                    <div class="result-value">${data.status.join(', ')}</div>
                </div>
            `;
        }

        // 注册和到期日期
        if (data.events && data.events.length > 0) {
            // 查找注册和到期日期
            const registrationEvent = data.events.find(e => e.eventAction === 'registration');
            const expirationEvent = data.events.find(e => e.eventAction === 'expiration');
            const lastChangedEvent = data.events.find(e => e.eventAction === 'last changed');

            if (registrationEvent) {
                const regDate = new Date(registrationEvent.eventDate);
                html += `
                    <div class="result-item">
                        <div class="result-label">注册日期:</div>
                        <div class="result-value">${regDate.toLocaleDateString()}</div>
                    </div>
                `;
            }

            if (expirationEvent) {
                const expDate = new Date(expirationEvent.eventDate);
                html += `
                    <div class="result-item">
                        <div class="result-label">到期日期:</div>
                        <div class="result-value">${expDate.toLocaleDateString()}</div>
                    </div>
                `;
            }

            if (lastChangedEvent) {
                const lastChanged = new Date(lastChangedEvent.eventDate);
                html += `
                    <div class="result-item">
                        <div class="result-label">最后更新:</div>
                        <div class="result-value">${lastChanged.toLocaleDateString()}</div>
                    </div>
                `;
            }
        }

        // 实体信息（注册人/管理员等）
        if (data.entities && data.entities.length > 0) {
            html += `<div class="result-item result-label">实体信息:</div>`;

            data.entities.forEach(entity => {
                const roles = entity.roles ? entity.roles.join(', ') : '未知角色';

                html += `
                    <div class="result-item" style="margin-left: 10px;">
                        <div class="result-label">${roles}:</div>
                        <div class="result-value">${entity.handle || ''}</div>
                    </div>
                `;

                // 显示实体名称等信息
                if (entity.vcardArray && entity.vcardArray[1]) {
                    const vcardEntries = entity.vcardArray[1];

                    // 尝试找到姓名、组织和地址
                    const fnEntry = vcardEntries.find(e => e[0] === 'fn');
                    const orgEntry = vcardEntries.find(e => e[0] === 'org');
                    const emailEntries = vcardEntries.filter(e => e[0] === 'email');

                    if (fnEntry) {
                        html += `
                            <div class="result-item" style="margin-left: 20px;">
                                <div class="result-value">名称: ${fnEntry[3]}</div>
                            </div>
                        `;
                    }

                    if (orgEntry) {
                        html += `
                            <div class="result-item" style="margin-left: 20px;">
                                <div class="result-value">组织: ${orgEntry[3]}</div>
                            </div>
                        `;
                    }

                    if (emailEntries.length > 0) {
                        emailEntries.forEach(email => {
                            html += `
                                <div class="result-item" style="margin-left: 20px;">
                                    <div class="result-value">邮箱: ${email[3]}</div>
                                </div>
                            `;
                        });
                    }
                }
            });
        }

        // 命名服务器信息
        if (data.nameservers && data.nameservers.length > 0) {
            html += `
                <div class="result-item">
                    <div class="result-label">域名服务器:</div>
                    <div class="result-value">${data.nameservers.map(ns => ns.ldhName).join('<br>')}</div>
                </div>
            `;
        }

        // 注册商信息
        if (data.entities) {
            const registrar = data.entities.find(e => e.roles && e.roles.includes('registrar'));
            if (registrar) {
                html += `
                    <div class="result-item">
                        <div class="result-label">注册商:</div>
                        <div class="result-value">${registrar.handle || registrar.ldhName || '未知'}</div>
                    </div>
                `;
            }
        }

        // 提供查看原始数据的选项
        html += `
            <div class="result-item">
                <div class="result-label">
                    <a href="#" id="toggle-raw-data">查看原始JSON数据</a>
                </div>
                <pre id="raw-data" style="display: none;">${JSON.stringify(data, null, 2)}</pre>
            </div>
        `;

        resultElement.innerHTML = html;

        // 添加原始数据切换事件
        document.getElementById('toggle-raw-data').addEventListener('click', function(e) {
            e.preventDefault();
            const rawData = document.getElementById('raw-data');
            rawData.style.display = rawData.style.display === 'none' ? 'block' : 'none';
            this.textContent = rawData.style.display === 'none' ? '查看原始JSON数据' : '隐藏原始JSON数据';
        });
    }

    // 初始化
    function init() {
        createPanel();
    }

    // 等待页面加载完成
    window.addEventListener('load', init);
})();
