import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const db=new PrismaClient();
async function main(){
 const email=process.env.ADMIN_EMAIL?.toLowerCase(),password=process.env.ADMIN_PASSWORD;
 if(!email||!password||password.length<12)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters)');
 const org=await db.organization.upsert({where:{id:'spiritus'},create:{id:'spiritus',name:'Spiritus Systems'},update:{}});
 const user=await db.user.upsert({where:{email},create:{email,name:'Spiritus Admin',passwordHash:await hash(password,12)},update:{}});
 await db.organizationMember.upsert({where:{organizationId_userId:{organizationId:org.id,userId:user.id}},create:{organizationId:org.id,userId:user.id,role:'ADMIN'},update:{}});
 for(const [name,price,fromPrice] of [['Basic Website',150,false],['Standard Website',250,false],['Corporate Website',450,false],['Invoicing System',99,false],['Website + Invoicing',250,false],['Online Store',300,true],['ShippingOS',750,true]] as const)await db.productPackage.upsert({where:{organizationId_name:{organizationId:org.id,name}},create:{organizationId:org.id,name,price,fromPrice},update:{}});
 console.log('Organization, admin and editable packages initialized. No prospect data invented.');
}
main().finally(()=>db.$disconnect());
