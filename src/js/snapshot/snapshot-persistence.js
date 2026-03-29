/*
 * snapshot-persistence.js - Recent snapshot persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createRecentItemsStore } from "../utils/recent-items-store.js";

const store = createRecentItemsStore({
  dbName: "zxspec-snapshot-persistence",
  storeName: "recentSnapshots",
  maxItems: 7,
  label: "snapshots",
});

export const addToRecentSnapshots = (filename, data) => store.add(filename, data);
export const getRecentSnapshots = () => store.getList();
export const loadRecentSnapshot = (id) => store.load(id, { updateAccessTime: true });
export const removeRecentSnapshot = (id) => store.remove(id);
