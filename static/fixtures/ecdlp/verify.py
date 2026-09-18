#!/usr/bin/env python3
"""ECDLP evidence runner. Authored by GPT-6 via Codex, 2026-09-04.

Verification boundary: exact checks and bounded searches only, not a full solver.
Run: python3 static/fixtures/ecdlp/verify.py   (from the repository root)
Dependencies: Python, SymPy, Z3, and PARI/GP on PATH. No network or file writes.
Failure: assertions or GP/subprocess errors terminate with a nonzero exit status.
"""
import json, math, sys, sympy, subprocess
from pathlib import Path
import z3
c=json.loads(Path(__file__).with_name("challenge.json").read_text())
p,a,b,n=map(int,[c["p"],c["a"],c["b"],c["n"]])
P=tuple(map(int,c["P"].values())); Q=tuple(map(int,c["Q"].values()))
def add(U,V,p,a):
 if U is None:return V
 if V is None:return U
 x,y=U;z,w=V
 if x==z and (y+w)%p==0:return None
 s=((3*x*x+a)*pow(2*y,-1,p) if U==V else (w-y)*pow(z-x,-1,p))%p
 t=(s*s-x-z)%p
 return t,(s*(x-t)-y)%p
def mul(k,U,p,a):
 R=None
 while k:
  if k&1:R=add(R,U,p,a)
  U=add(U,U,p,a);k>>=1
 return R
assert mul(19,(5,1),17,2) is None
assert mul(2,(5,1),17,2)==(6,3)
assert mul(7,(5,1),17,2)==(0,6)
assert add((5,1),(5,16),17,2) is None
assert add(None,(5,1),17,2)==(5,1)
assert P!=Q and P!=(Q[0],(-Q[1])%p)
assert all(0<=t<p for t in (a,b,*P,*Q))
assert (P[1]**2-P[0]**3-a*P[0]-b)%p==0
assert (Q[1]**2-Q[0]**3-a*Q[0]-b)%p==0
assert mul(n,P,p,a) is None and mul(n,Q,p,a) is None
D=(-16*(4*a**3+27*b*b))%p;assert D
j=(1728*4*a**3*pow(4*a**3+27*b*b,-1,p))%p
s=math.isqrt(4*p);lo=(p+1-s+n-1)//n;hi=(p+1+s)//n
assert lo==hi==5

import time
t0=time.monotonic();m=1<<16
def bounded_bsgs(base,targets,m,p,a):
 table={};R=None
 for j in range(m):
  table.setdefault(R,j);R=add(R,base,p,a)
 step=mul(m,base,p,a)
 negstep=(step[0],(-step[1])%p)
 found=[]
 for target in targets:
  R=target;hit=None
  for i in range(m):
   j=table.get(R)
   if j is not None:
    hit=i*m+j;assert mul(hit,base,p,a)==target;break
   R=add(R,negstep,p,a)
  found.append(hit)
 return found
assert bounded_bsgs((5,1),[(0,6)],5,17,2)==[7]
found=bounded_bsgs(P,[Q,(Q[0],(-Q[1])%p)],m,p,a)

assert found == [None, None], "A small scalar was found; verify and report it."
small_search = {"m":m,"x_interval":["1",str(m*m-1)],"n_minus_x_interval":["1",str(m*m-1)],"hits":found}
B=1<<16;table={};R=None
for u in range(1,B+1):
 R=add(R,P,p,a);table[R]=u;table[(R[0],(-R[1])%p)]=-u
R=None;hit=None
for v in range(1,B+1):
 R=add(R,Q,p,a)
 if R in table:
  u=table[R];x=(u*pow(v,-1,n))%n
  assert mul(x,P,p,a)==Q
  hit={"u":u,"v":v,"x":str(x)};break

assert hit is None, "A bounded rational scalar was found; verify and report it."
factors=[(2,2),(23,1),(613,1),(1489,1),(51107327756035783,1),(66527854564877510011,1),(64467157784386614394756842980429,1)]
assert math.prod(q**e for q,e in factors)==n-1
assert pow(p,n-1,n)==1
assert all(pow(p,(n-1)//q,n)!=1 for q,e in factors)
u,v,k=z3.Ints("u v k")
solver=z3.Solver();solver.set(timeout=10000)
solver.add(u>=1,u<n,v>=1,v<n,u!=v,u-v==k*n)
assert solver.check()==z3.unsat
gp_code=f"""p={p};a={a};b={b};n={n};P=[{P[0]},{P[1]}];Q=[{Q[0]},{Q[1]}];E=ellinit([a,b],p);
print("version=",version());
print("primes=",isprime(p)&&isprime(n));
print("factor_primes=",vector(7,i,isprime([{",".join(str(q) for q,e in factors)}][i])));
print("points=",ellisoncurve(E,P)&&ellisoncurve(E,Q));
print("orders=",ellmul(E,P,n)==[0]&&ellmul(E,Q,n)==[0]);
print("cardinality=",ellcard(E));print("discriminant=",lift(E.disc));print("j=",lift(E.j));
bsgs(E,P,Q,m)={{my(T=Map(),R=[0],S,j);for(k=0,m-1,mapput(T,lift(R),k);R=elladd(E,R,P));S=ellneg(E,R);for(i=0,m-1,if(mapisdefined(T,lift(Q),&j),return(i*m+j));Q=elladd(E,Q,S));return(-1)}};
e0=ellinit([2,2],17);print("canary=",ellcard(e0)==19&&ellmul(e0,[5,1],19)==[0]&&bsgs(e0,[5,1],[0,6],5)==7);
print("positive_search=",bsgs(E,P,Q,65536));print("negative_search=",bsgs(E,P,ellneg(E,Q),65536));
"""
proc=subprocess.run(["gp","-q","-f","-s","256000000"],input=gp_code,text=True,capture_output=True,timeout=120,check=True)
assert "***" not in proc.stderr, proc.stderr
gp=dict(line.split("=",1) for line in proc.stdout.splitlines() if "=" in line)
for key in ("primes","points","orders","canary"):assert gp[key]=="1",(key,gp)
assert gp["factor_primes"]=="[1, 1, 1, 1, 1, 1, 1]"
assert int(gp["cardinality"])==5*n
assert int(gp["discriminant"])==D and int(gp["j"])==j
assert gp["positive_search"]==gp["negative_search"]=="-1"
assert int(gp["cardinality"])!=p and j not in (0,1728)
# The Hasse/order argument independently pins the curve cardinality to 5*n.
assert lo==hi==5 and n!=5
report={
 "status":"open","secret_x":None,
 "tools":{"python":sys.version.split()[0],"sympy":sympy.__version__,"z3":z3.get_version_string(),"pari_gp":gp["version"]},
 "verified":{"prime_p":True,"prime_n":True,"nP_is_identity":True,"nQ_is_identity":True,"points_on_curve":True,
 "discriminant":str(D),"j":str(j),"cardinality":str(5*n),"hasse_multiplier_bounds":[lo,hi],
 "trace":str(p+1-5*n),"embedding_degree":str(n-1),"embedding_degree_factorization":[[str(q),e] for q,e in factors],
 "embedding_degree_certificate":"p^(n-1)=1 mod n; p^((n-1)/q)!=1 for every certified prime q dividing n-1",
 "integer_uniqueness_counterexample":"unsat","uniqueness_scope":"conditional on n dividing the scalar difference, which follows from exact order n"},
 "searches":{"integer_bsgs":small_search,"rational":{"abs_numerator_max":B,"denominator_max":B,"candidate":hit}},
 "generic_baseline":{"n_bits":n.bit_length(),"ceil_sqrt_n":str(math.isqrt(n)+1),"log2_sqrt_n":math.log2(n)/2},
 "limits":["No full-range scalar search","No general impossibility claim","Z3 certifies the integer interval lemma, not an implementation of elliptic-curve arithmetic","Rational search checked by exact Python group arithmetic; interval search independently repeated in PARI/GP"],
 "commands":{"rerun":"python3 research/ecdlp/verify.py","gp_invocation":"gp -q -f -s 256000000"}
}
print(json.dumps(report,indent=2,sort_keys=True))

