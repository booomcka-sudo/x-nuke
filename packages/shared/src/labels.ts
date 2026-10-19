import {z} from 'zod';
import {categories} from './index.js';
export const labelSchema=z.object({
 accountId:z.string().min(1).max(100),category:z.enum(categories),
 source:z.string().url().refine(value=>new URL(value).protocol==='https:','Public evidence must use HTTPS'),
 verifiedAt:z.string().datetime(),confidence:z.number().min(0).max(1),
 wallet:z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional(),method:z.string().min(3).max(500).optional(),
 closedTrades:z.number().int().nonnegative().optional(),realizedPnl:z.number().finite().optional(),unrealizedPnl:z.number().finite().optional(),fees:z.number().finite().nonnegative().optional(),
 pnlCurrency:z.literal('USD').optional(),period:z.string().min(1).max(200).optional(),historyQuality:z.enum(['sufficient','partial','insufficient']).optional(),
}).strict().superRefine((label,context)=>{
 if(label.wallet&&!label.method)context.addIssue({code:'custom',path:['method'],message:'A public ownership method is required for a wallet link'});
 if((label.realizedPnl!==undefined||label.unrealizedPnl!==undefined||label.fees!==undefined)&&label.pnlCurrency!=='USD')context.addIssue({code:'custom',path:['pnlCurrency'],message:'Imported monetary metrics must explicitly state USD'});
});
