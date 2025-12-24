const ext = typeof browser !== 'undefined' ? browser : chrome;
const actionApi = ext.action || ext.browserAction;

actionApi.onClicked.addListener((tab) => {
    ext.tabs.sendMessage(tab.id, {});
});
