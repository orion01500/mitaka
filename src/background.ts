import { browser, ContextMenus, Extension } from "webextension-polyfill-ts";

import { Command } from "./lib/command";
import { Selector } from "./lib/selector";
import {
  AnalyzerEntry,
  GeneralSettings,
  SearcherStates,
  UpdateContextMenuMessage,
} from "./lib/types";
import { getApiKeys, getGeneralSettings } from "./utility";

export async function showNotification(message: string): Promise<void> {
  await browser.notifications.create({
    iconUrl: "./icons/48.png",
    message,
    title: "Mitaka",
    type: "basic",
  });
}

export async function search(command: Command): Promise<void> {
  try {
    const url: string = command.search();
    if (url !== "") {
      await browser.tabs.create({ url });
    }
  } catch (e) {
    const err = <Extension.PropertyLastErrorType>e;
    await showNotification(err.message);
  }
}

export async function searchAll(command: Command): Promise<void> {
  try {
    const config = await browser.storage.sync.get("searcherStates");
    const states: SearcherStates = <SearcherStates>(
      ("searcherStates" in config ? config["searcherStates"] : {})
    );
    const urls = command.searchAll(states);
    for (const url of urls) {
      await browser.tabs.create({ url });
    }
  } catch (e) {
    const err = <Extension.PropertyLastErrorType>e;
    await showNotification(err.message);
  }
}

export async function scan(command: Command): Promise<void> {
  const apiKeys = await getApiKeys();
  try {
    const url: string = await command.scan(apiKeys);
    if (url !== "") {
      await browser.tabs.create({ url });
    }
  } catch (e) {
    const err = <Extension.PropertyLastErrorType>e;
    await showNotification(err.message);
  }
}

export function createContextMenuErrorHandler(): void {
  if (browser.runtime.lastError) {
    console.error(browser.runtime.lastError.message);
  }
}

export async function createContextMenus(
  message: UpdateContextMenuMessage,
  searcherStates: SearcherStates,
  generalSettings: GeneralSettings
): Promise<void> {
  await browser.contextMenus.removeAll();

  const text: string = message.selection;
  const selector: Selector = new Selector(text, generalSettings.enableIDN);
  // create searchers context menus based on a type of the input
  const searcherEntries: AnalyzerEntry[] = selector.getSearcherEntries();
  let nonTextEntry: AnalyzerEntry | undefined = undefined;

  for (const entry of searcherEntries) {
    const name = entry.analyzer.name;
    // continue if a searcher is disabled by options
    if (name in searcherStates && !searcherStates[name]) {
      continue;
    }

    if (entry.type !== "text" && nonTextEntry === undefined) {
      nonTextEntry = entry;
    }

    // it tells action, query, type and target to the listner
    const id = `Search ${entry.query} as a ${entry.type} on ${name}`;
    const title = `Search this ${entry.type} on ${name}`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }

  // search it on all services
  if (nonTextEntry !== undefined) {
    const query = nonTextEntry.query;
    const type = nonTextEntry.type;
    const id = `Search ${query} as a ${type} on all`;
    const title = `Search this ${type} on all`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }

  // create scanners context menus based on a type of the input
  const scannerEntries: AnalyzerEntry[] = selector.getScannerEntries();
  for (const entry of scannerEntries) {
    const name = entry.analyzer.name;
    // it tells action/query/type/target to the listner
    const id = `Scan ${entry.query} as a ${entry.type} on ${name}`;
    const title = `Scan this ${entry.type} on ${name}`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }
}

if (typeof browser !== "undefined" && browser.runtime !== undefined) {
  browser.runtime.onMessage.addListener(
    async (message: UpdateContextMenuMessage): Promise<void> => {
      if (message.request === "updateContextMenu") {
        const config = await browser.storage.sync.get("searcherStates");
        const generalSettings = await getGeneralSettings();

        if ("searcherStates" in config) {
          const searcherStates = <SearcherStates>config["searcherStates"];
          await createContextMenus(message, searcherStates, generalSettings);
        } else {
          await createContextMenus(message, {}, generalSettings);
        }
      }
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  browser.contextMenus.onClicked.addListener(async (info, tab_) => {
    const id: string = info.menuItemId.toString();
    const command = new Command(id);
    switch (command.action) {
      case "search":
        if (command.target === "all") {
          await searchAll(command);
        } else {
          await search(command);
        }
        break;
      case "scan":
        await scan(command);
        break;
    }
  });
}
