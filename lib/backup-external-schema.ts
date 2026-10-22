// Verified external Bot schema, observed 2026-10-22. It is not an application
// migration: absent external tables stay absent. SQL lives only in the private
// backup; exact hashes prevent a snapshot from introducing arbitrary triggers.
export const EXTERNAL_BOT_TABLES=['admin_phone_activations','admin_phone_revocations','console_plan_deactivations'] as const;
const objects=[
 ['admin_phone_activations','table','admin_phone_activations','a108f9c158c97fa2c1a3251e493d5e9d6f637c8191e6357277c2403741023194'],
 ['admin_phone_revocations','table','admin_phone_revocations','d8f0cff6438136cb1c3a794820ab77ff891ce149ec61a85298b6698c2f3077b9'],
 ['console_plan_deactivations','table','console_plan_deactivations','09143fbce6aaa68f6e8366b286c8538894d50cf6674ad952a3a9e7b49d37c48f'],
 ['admin_phone_activate_v1','trigger','admin_phone_activations','1ca94b5b71fcf9883240523b70f77b0016913aab720c08ded34f1e2d8b9f59fd'],
 ['admin_phone_apply_v1','trigger','admin_phone_activations','5e2ce975057465bdfa444a8dcd02eb2ccbc63b15079b767befce9e22dd68b670'],
 ['admin_phone_cancel_challenges_v1','trigger','admin_phone_activations','99b8614e067cbbfd8ff3ff58e3103eb111e51f60f7399a7988d770fcfb5ec34b'],
 ['admin_phone_operator_v1','trigger','admin_phone_activations','aad163ec514ac9f0ddaa2e702786f33151a9c048d059af63b97291c90742e776'],
 ['admin_phone_revoke_apply_v1','trigger','admin_phone_revocations','85bfa83c889367c668082f38e65423f3d41c3483d02e15c430d1d3847f2ea6e7'],
 ['admin_phone_revoke_guard_v1','trigger','admin_phone_revocations','e55d0de3658efca0d38dc5e62e54021f910431cfc91455d3d7de86117174b79f'],
 ['console_plan_deactivate_apply_v1','trigger','console_plan_deactivations','714bdc1120150aa1929bc66228d415d11b728ed71f6b553261fd0c894098a5f7'],
 ['console_plan_deactivate_guard_v1','trigger','console_plan_deactivations','8d10a61e44a9fb5cd7d0ecc726b60f015c473ff9db2347da8413032e24e57fef'],
] as const;
export type ExternalSchemaObject={name:string;type:string;sql:string};
export function externalSchemaPlan(tableNames:readonly string[],supplied:unknown,hashes:Record<string,string>){
 const present=EXTERNAL_BOT_TABLES.filter(name=>tableNames.includes(name));
 const expected=objects.filter(item=>present.includes(item[2]));
 const fail=()=>{throw Error('Unrecognized or incomplete external Bot backup schema');};
 if(supplied===undefined&&!present.length)return{names:[] as string[],tables:[] as string[],triggers:[] as string[]};
 if(!Array.isArray(supplied)||supplied.length!==expected.length)fail();
 const values=supplied as ExternalSchemaObject[],seen=new Set<string>();
 for(const item of values){
  if(!item||typeof item!=='object'||Object.keys(item).sort().join(',')!=='name,sql,type'||typeof item.name!=='string'||typeof item.type!=='string'||typeof item.sql!=='string'||seen.has(item.name))fail();
  seen.add(item.name);const known=expected.find(entry=>entry[0]===item.name);
  if(!known||known[1]!==item.type||hashes[item.name]!==known[3])fail();
 }
 return{names:[...present],tables:values.filter(item=>item.type==='table').map(item=>item.sql),triggers:values.filter(item=>item.type==='trigger').map(item=>item.sql)};
}
