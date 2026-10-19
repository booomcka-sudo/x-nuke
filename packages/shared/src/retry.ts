export function retryDelay(attempts:number,retryAfter=0,jitter=Math.random()) {
 return Math.ceil(Math.max(retryAfter,Math.min(60000,1000*2**attempts))+Math.max(0,Math.min(1,jitter))*1000);
}
