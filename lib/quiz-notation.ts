export type QuizNotationPart={kind:'text';text:string}|{kind:'math';text:string;display:boolean;automatic:boolean};
export type QuizNotationWarning={expression:string;reason:'ambiguousScope'|'unbalancedGroup'};
const elements=new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '));
const units=new Set(['mm','cm','km','nm','ms','kg','mol','Hz','Pa','kPa','MPa','MHz','kHz']);
function chemical(value:string){const atoms=value.match(/[A-Z][a-z]?/g);return Boolean(atoms&&atoms.join('')===value&&atoms.every(x=>elements.has(x)));}
function allowedBase(value:string){return /^\d+(?:\.\d+)?$/.test(value)||/^[a-zA-Z]$/.test(value)||/^(?=.*\d)[A-F\d]+$/.test(value)||units.has(value)||chemical(value)||/^\([^()\n]+\)$/.test(value);}
function formulaBase(value:string){return units.has(value)||value.length>1&&chemical(value)?'\\mathrm{'+value+'}':value;}
function protectedToken(value:string){return /(?:https?:\/\/|www\.|^\\\$|^[A-Za-z]:[\/\\]|^(?:\.\.?[\/\\]|[\/\\]{1,2}[A-Za-z_])|^[A-Za-z][A-Za-z0-9_.-]*[\/\\][A-Za-z]|@|\.[a-zA-Z]{1,8}(?:[?#][^\s]*)?[),;:\]]*$|^[\p{L}\p{N}_-]*_qb\d|^[\p{L}\p{N}_-]*qb\d+_)/iu.test(value);}
function braceGroup(text:string,start:number){let depth=0;for(let i=start;i<Math.min(text.length,start+1000);i++){if(text[i]==='\n'||text[i]==='$')return null;if(text[i]==='{'){if(++depth>16)return null;}else if(text[i]==='}'&&--depth===0)return {value:text.slice(start+1,i),end:i+1};}return null;}
// Formatting never changes the saved question or evaluates an expression.
// Unbraced multi-letter/fractional indices remain literal for source review.
export function parseQuizNotation(source:string):{parts:QuizNotationPart[];warnings:QuizNotationWarning[]}{
 const parts:QuizNotationPart[]=[],warnings:QuizNotationWarning[]=[];
 const pushText=(value:string)=>{if(!value)return;const last=parts.at(-1);if(last?.kind==='text')last.text+=value;else parts.push({kind:'text',text:value});};
 const warn=(value:string,reason:QuizNotationWarning['reason'])=>{const expression=value.slice(0,100);if(!warnings.some(w=>w.expression===expression&&w.reason===reason))warnings.push({expression,reason});};
 function plain(text:string){
  let end=0,blockedUntil=0;
  const protectedRanges=[...text.matchAll(/\S+/gu)].filter(m=>protectedToken(m[0])).map(m=>[m.index!,m.index!+m[0].length]);
  const value=text;
   const pattern=/(?<![A-Za-z0-9_\\])(\([^()\n]{1,120}\)|\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9]*)(?=[_^])/g;
   for(const candidate of value.matchAll(pattern)){
    const start=candidate.index!,base=candidate[1];if(start<Math.max(end,blockedUntil)||protectedRanges.some(([a,b])=>start>=a&&start<b)||!allowedBase(base)||value.startsWith('__',start+base.length))continue;
    let position=start+base.length,formula=formulaBase(base),bad:QuizNotationWarning['reason']|null=null;const seen=new Set<string>();
    while(value[position]==='^'||value[position]==='_'){
     const marker=value[position++];if(seen.has(marker)){bad='ambiguousScope';break;}seen.add(marker);
     let script='';const explicit=value[position]==='{';
     if(explicit){const group=braceGroup(value,position);if(!group||!group.value){bad='unbalancedGroup';break;}script=group.value;position=group.end;}
     else{
      const match=value.slice(position).match(marker==='^'?/^[+-]?(?:\d+(?:\.\d+)?|[A-Za-z]+)/:/^(?:\d+|[A-Za-z]+)/);
      if(!match||/^[+-]?[A-Za-z]{2,}$/.test(match[0])){bad='ambiguousScope';break;}script=match[0];position+=script.length;
      if(value[position]==='/'||marker==='^'&&chemical(base)&&/[+-]/.test(value[position]||'')&&!/[A-Za-z0-9]/.test(value[position+1]||'')){bad='ambiguousScope';break;}
     }
     formula+=marker+'{'+script+'}';
    }
    if(!bad&&/[A-Za-z0-9]/.test(value[position]||'')){
     // H_2O and SO_4 are chemistry indices, not number-base assertions.
     const suffix=value.slice(position).match(/^(?:[A-Z][a-z]?)+/);
     if(chemical(base)&&suffix&&chemical(suffix[0])&&!/[_^A-Za-z0-9]/.test(value[position+suffix[0].length]||'')){formula+='\\mathrm{'+suffix[0]+'}';position+=suffix[0].length;}
     else bad='ambiguousScope';
    }
    if(bad){const tail=value.slice(start),boundary=tail.search(bad==='unbalancedGroup'?/\n/:/\s/);blockedUntil=boundary<0?value.length:start+boundary;warn(value.slice(start,blockedUntil),bad);continue;}
    pushText(text.slice(end,start));parts.push({kind:'math',text:formula,display:false,automatic:true});end=position;
   }
  pushText(text.slice(end));
 }
 // Explicit formulas and quoted code are protected before examining legacy
 // notation. Existing braces and LaTeX commands are never rewritten.
 const protectedParts=/```[\s\S]*?```|`[^`\n]*`|(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$([^\n$]+?)(?<!\\)\$/g;let end=0;
 for(const match of source.matchAll(protectedParts)){
  plain(source.slice(end,match.index));if(match[1]!==undefined||match[2]!==undefined)parts.push({kind:'math',text:match[1]??match[2],display:match[1]!==undefined,automatic:false});else pushText(match[0]);end=match.index!+match[0].length;
 }
 plain(source.slice(end));return {parts,warnings};
}
