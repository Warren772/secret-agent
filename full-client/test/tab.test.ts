import { Helpers } from '@secret-agent/testing';
import { Command } from '@secret-agent/client/interfaces/IInteractions';
import { KeyboardKeys } from '@secret-agent/core-interfaces/IKeyboardLayoutUS';
import * as os from 'os';
import { ITestKoaServer } from '@secret-agent/testing/helpers';
import { Handler } from '../index';

let koaServer: ITestKoaServer;
let handler: Handler;
beforeAll(async () => {
  handler = new Handler();
  Helpers.onClose(() => handler.close(), true);
  koaServer = await Helpers.runKoaServer();
  koaServer.get('/tabTest', ctx => {
    ctx.body = `<body>
<a target="_blank" href="/newTab">Nothing really here</a>
</body>`;
  });
  koaServer.get('/newTab', ctx => {
    ctx.body = `<body>
<h1 id="newTabHeader">You are here</h1>
<a href="#hash">Go back</a>
</body>`;
  });
});
afterAll(Helpers.afterAll);
afterEach(Helpers.afterEach);

describe('Multi-tab scenarios', () => {
  it('can wait for another tab', async () => {
    const agent = await handler.createAgent();
    Helpers.needsClosing.push(agent);

    await agent.goto(`${koaServer.baseUrl}/tabTest`);
    const tab1 = agent.activeTab;
    const url = await agent.document.location.host;
    expect(url).toBe(koaServer.baseHost);

    await agent.click(agent.document.querySelector('a'));
    const newTab = await agent.waitForNewTab();

    expect(await agent.tabs).toHaveLength(2);
    expect(newTab.tabId).not.toBe(agent.activeTab.tabId);
    expect(await newTab.url).toBe(`${koaServer.baseUrl}/newTab`);
    await agent.focusTab(newTab);
    expect(await agent.activeTab.url).toBe(`${koaServer.baseUrl}/newTab`);
    const { document } = agent;
    expect(await document.querySelector('#newTabHeader').textContent).toBe('You are here');

    await agent.click(agent.document.querySelector('a'));
    expect(await agent.activeTab.url).toBe(`${koaServer.baseUrl}/newTab#hash`);

    const meta = await agent.meta;
    // make sure user agent is wired up
    const navigatorAgent = await agent.getJsValue('navigator.userAgent');
    expect(navigatorAgent.value).toBe(meta.userAgentString);

    // make sure polyfills ran
    const csi = await agent.getJsValue<any>('chrome.csi()');
    expect(csi.value.startE).toBeTruthy();

    await agent.closeTab(newTab);
    const newTabList = await agent.tabs;
    expect(newTabList).toHaveLength(1);
    expect(agent.activeTab).toBe(tab1);
  });

  it('can wait for resources in each tab', async () => {
    koaServer.get('/logo.png', ctx => {
      ctx.set('Content-Type', 'image/png');
      ctx.body = Helpers.getLogo();
    });
    koaServer.get('/page1', ctx => {
      ctx.body = `<body>
<img src="/logo.png?page=page1" alt="logo"/>
<img src="/logo.png" alt="logo"/>
<a target="_blank" href="/page2">Nothing really here</a>
</body>`;
    });
    koaServer.get('/page2', ctx => {
      ctx.body = `<body>
<h1 id="newTabHeader">You are here</h1>
<img src="/logo.png?page=page2" alt="logo"/>
<img src="/logo.png" alt="logo"/>
<a href="/page1" id="back">Go back</a>
<a href="/page3" id="fwd">Go back</a>
</body>`;
    });
    koaServer.get('/page3', ctx => {
      ctx.body = `<body><h1>Final</h1></body>`;
    });

    const agent = await handler.createAgent();
    Helpers.needsClosing.push(agent);

    await agent.goto(`${koaServer.baseUrl}/page1`);
    await agent.waitForPaintingStable();
    expect(await agent.tabs).toHaveLength(1);
    expect(await agent.url).toBe(`${koaServer.baseUrl}/page1`);
    await agent.click(agent.document.querySelector('a'));

    const tab1 = agent.activeTab;
    const page1Logos = await tab1.waitForResource({
      url: '/logo.png',
    });
    expect(page1Logos).toHaveLength(2);
    const urls = await Promise.all([page1Logos[0].request.url, page1Logos[1].request.url]);
    urls.sort();
    expect(urls).toStrictEqual([
      `${koaServer.baseUrl}/logo.png`,
      `${koaServer.baseUrl}/logo.png?page=page1`,
    ]);

    const tabs = await agent.tabs;
    expect(tabs).toHaveLength(2);
    const tab2 = tabs[1];
    const page2Logos = await tab2.waitForResource({
      url: '/logo.png?page=page2',
    });
    expect(page2Logos).toHaveLength(1);
    expect(await page2Logos[0].request.url).toBe(`${koaServer.baseUrl}/logo.png?page=page2`);
    await tab2.focus();
    await tab2.waitForPaintingStable();
    await agent.click(tab2.document.querySelector('#fwd'));
    await tab2.waitForLocation('change');
    expect(await agent.url).toBe(`${koaServer.baseUrl}/page3`);
    expect(await tab2.url).toBe(`${koaServer.baseUrl}/page3`);
    expect(await tab1.url).toBe(`${koaServer.baseUrl}/page1`);
  }, 30e3);

  it('can command click on a link to get to a new tab', async () => {
    koaServer.get('/tabTest2', ctx => {
      ctx.body = `<body>
<a href="/newTab">Nothing else really here</a>
</body>`;
    });

    const agent = await handler.createAgent();
    Helpers.needsClosing.push(agent);

    await agent.goto(`${koaServer.baseUrl}/tabTest2`);
    const newTabKey = os.platform() === 'darwin' ? KeyboardKeys.MetaLeft : KeyboardKeys.ControlLeft;
    await agent.interact({
      [Command.keyDown]: newTabKey,
    });
    await agent.click(agent.document.querySelector('a'));
    const newTab = await agent.waitForNewTab();

    expect(await newTab.tabId).not.toBe(await agent.activeTab.tabId);
    expect(await newTab.url).toBe(`${koaServer.baseUrl}/newTab`);
    await agent.focusTab(newTab);
    const { document } = newTab;
    expect(await document.querySelector('#newTabHeader').textContent).toBe('You are here');

    await agent.click(document.querySelector('a'));
    expect(await agent.activeTab.url).toBe(`${koaServer.baseUrl}/newTab#hash`);

    const meta = await agent.meta;
    // make sure user agent is wired up
    const navigatorAgent = await agent.getJsValue('navigator.userAgent');
    expect(navigatorAgent.value).toBe(meta.userAgentString);

    // make sure polyfills ran
    const csi = await agent.getJsValue<any>('chrome.csi()');
    expect(csi.value.startE).toBeTruthy();

    await agent.closeTab(newTab);
  });

  it('can handle new tabs created in js callbacks', async () => {
    koaServer.get('/ajaxNewResult', ctx => {
      ctx.body = '<h1>Overridden Result</h1>';
    });
    koaServer.get('/ajaxTab', ctx => {
      ctx.body = `<body>
<a href="/newTab">Nothing else really here</a>
<script>
document.querySelector('a').addEventListener('click', event => {
  // Prevent default link behavior
  event.preventDefault();
  event.stopPropagation();

  // Simulate Asynchronous delay
  setTimeout(function(){
      window.open('${koaServer.baseUrl}/ajaxNewResult', '_blank');
  }, 100);
  return false;
})
</script>
</body>`;
    });

    const agent = await handler.createAgent();
    Helpers.needsClosing.push(agent);

    await agent.goto(`${koaServer.baseUrl}/ajaxTab`);
    await agent.click(agent.document.querySelector('a'));
    const newTab = await agent.waitForNewTab();

    expect(await newTab.tabId).not.toBe(await agent.activeTab.tabId);
    expect(await newTab.url).toBe(`${koaServer.baseUrl}/ajaxNewResult`);
    await agent.focusTab(newTab);
    const { document } = newTab;
    expect(await document.querySelector('h1').textContent).toBe('Overridden Result');

    const meta = await agent.meta;
    // make sure user agent is wired up
    const navigatorAgent = await agent.getJsValue('navigator.userAgent');
    expect(navigatorAgent.value).toBe(meta.userAgentString);

    await agent.closeTab(newTab);
  });
});
