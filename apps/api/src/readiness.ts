interface ReadinessDependencies {
 database:(sql:string)=>Promise<{rowCount:number|null}>;
 queue:()=>Promise<unknown>;
}
export async function checkReadiness(dependencies:ReadinessDependencies) {
 let stage='database_migrations';
 try {
  const migration=await dependencies.database("SELECT name FROM migrations WHERE name='0003'");
  if(!migration.rowCount)return {ok:false as const,reason:'database_migrations_required',stage,code:'missing_migration'};
  stage='database_schema';
  await dependencies.database('SELECT 1 FROM users,worker_heartbeats LIMIT 0');
  stage='redis';
  await dependencies.queue();
  return {ok:true as const};
 }catch(error){
  const rawCode=error&&typeof error==='object'&&'code' in error?error.code:undefined;
  const code=typeof rawCode==='string'&&/^[A-Z0-9_]{2,32}$/.test(rawCode)?rawCode:'unavailable';
  return {ok:false as const,reason:'database_or_queue_not_ready',stage,code};
 }
}
