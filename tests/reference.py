"""Independent Python price path, window-product signals, cash and no-cost counterfactual."""
import subprocess,json,math
n=0;maxdiff=0
def eq(a,b):
 global n,maxdiff
 n+=1
 if a is None or isinstance(a,(str,bool)):assert a==b,(a,b);return
 d=abs(a-b)/max(1,abs(a));maxdiff=max(maxdiff,d);assert d<1e-10,(a,b,d)
for seed in[1,2,2026,2147483648,4294967295]:
 for mode in['trend','chop','flat']:
  for l,th,bps in[(20,0,0),(60,.01,5),(120,.1,100)]:
   data=json.loads(subprocess.check_output(['java','-cp','build/classes','Dump',str(seed),mode,str(l),str(th),str(bps)]));state=seed;rets=[]
   for i in range(360):
    for direction,k in [('l',13),('r',17),('l',5)]:state=(state^((state<<k)if direction=='l'else(state>>k)))&0xffffffff
    u=state/4294967296*2-1;rets.append(0 if mode=='flat'else((.009 if i%2==0 else-.009)+.003*u)if mode=='chop'else((.002 if i<120 or i>=240 else-.002)+.008*u))
   prices=[100]
   for r in rets:prices.append(prices[-1]*(1+r))
   cash=1;qa=0;fees=gross=0;free=1;entries=exits=invested=0;peak=1;mdd=0;held=0;c=bps*.0001
   for i in range(360):
    signal=math.prod(1+r for r in rets[i-l:i])-1 if i>=l else None;target=int(signal>th)if signal is not None else 0;action='Warm-up'if i<l else'Hold cash';traded=fee=0
    if target and not held:qa=cash/(prices[i]*(1+c));traded=qa*prices[i];fee=traded*c;cash=0;entries+=1;action='Buy'
    elif held and not target:traded=qa*prices[i];fee=traded*c;cash=traded-fee;qa=0;exits+=1;action='Sell'
    elif target:action='Hold shares'
    held=target;fees+=fee;gross+=qa*(prices[i+1]-prices[i]);free*=1+rets[i]if target else 1;invested+=target
    if i==359 and held:t=qa*prices[i+1];f=t*c;traded+=t;fee+=f;fees+=f;cash=t-f;qa=held=0;exits+=1;action='Buy + terminal sell'if action=='Buy'else'Terminal sell'
    equity=cash+qa*prices[i+1];peak=max(peak,equity);mdd=max(mdd,1-equity/peak)
    expected=dict(period=i+1,startPrice=prices[i],endPrice=prices[i+1],assetReturn=rets[i],signal=signal,exposure=target,action=action,traded=traded,fee=fee,totalFees=fees,shares=qa,cash=cash,equity=equity,noFeeEquity=free,grossPnl=gross)
    for k,v in expected.items():eq(data['rows'][i][k],v)
   for k,v in dict(entries=entries,exits=exits,invested=invested,totalFees=fees,grossPnl=gross,net=equity-1,noFeeNet=free-1,drag=free-equity,maxDrawdown=mdd).items():eq(data[k],v)
print(n,'independent Python PRNG/window-product/cash/fees/counterfactual checks; maxscaled',maxdiff)
