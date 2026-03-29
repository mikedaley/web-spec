/*
 * disk-persistence.js - Disk image persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createRecentItemsStore } from "../utils/recent-items-store.js";

const store = createRecentItemsStore({
  dbName: "zxspec-disk-persistence",
  storeName: "recentDisks",
  maxItems: 10,
  label: "disks",
});

export const addToRecentDisks = (filename, data) => store.add(filename, data);
export const getRecentDisks = () => store.getList();
export const loadRecentDisk = (id) => store.load(id);
export const clearRecentDisks = () => store.clear();
