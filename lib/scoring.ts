export const limits = {fit:25,opportunity:20,relationship:20,commercial:15,accessibility:10,engagement:10};
export function scoreLead(input:Partial<Record<keyof typeof limits,number>>) {
 const breakdown = Object.fromEntries(Object.entries(limits).map(([key,max])=>[key,Math.max(0,Math.min(max,input[key as keyof typeof limits]||0))]));
 const total = Object.values(breakdown).reduce((a,b)=>a+b,0);
 return {total,breakdown,category:total>=80?'High priority':total>=60?'Strong opportunity':total>=40?'Nurture':'Low priority'};
}
