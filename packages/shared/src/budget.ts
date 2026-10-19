import {config} from './config.js';
export function scanBudget(demo=config.DEMO_MODE) {
 return {quickFollowers:Math.min(config.SCAN_MAX_FOLLOWERS,demo?50:config.SCAN_LIVE_QUICK_FOLLOWERS),deepFollowers:Math.min(config.SCAN_MAX_FOLLOWERS,demo?config.SCAN_MAX_FOLLOWERS:config.SCAN_LIVE_DEEP_FOLLOWERS),fetchPosts:demo||config.SCAN_FETCH_POSTS};
}
