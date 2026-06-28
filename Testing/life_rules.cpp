#include "../src/core/z80/z80.hpp"
#include "../src/core/z80/z80_assembler.hpp"
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <map>
using WordReg=zxspec::Z80::WordReg;
static uint8_t M[65536];
static uint8_t rd(uint16_t a,void*){return M[a];} static void wr(uint16_t a,uint8_t d,void*){M[a]=d;}
static uint8_t ior(uint16_t,void*){return 0xFF;} static void iow(uint16_t,uint8_t,void*){}
static void nc(uint16_t,uint32_t,void*){}
static zxspec::Z80 cpu; static std::map<std::string,uint16_t> sym;
static bool run(uint16_t a){cpu.setRegister(WordReg::SP,0xFEFE);M[0xFEFF]=0;M[0xFEFE]=0;
  cpu.setRegister(WordReg::PC,a);for(long i=0;i<2000000;i++){cpu.execute(1);if(cpu.getRegister(WordReg::PC)==0)return true;}return false;}
static uint16_t cur(){return M[sym["curGrid"]]|(M[sym["curGrid"]+1]<<8);}
static int cell(int y,int x){return M[cur()+y*34+x]?1:0;}
static void setcell(int y,int x,int v){M[cur()+y*34+x]=v;}
static void clearbuf(){run(sym["clear_grid"]);}
static void gen(){run(sym["wrap"]);run(sym["step"]);run(sym["swap"]);}
int main(){
  std::ifstream f("Testing/life.asm");std::stringstream ss;ss<<f.rdbuf();
  auto r=zxspec::z80Assemble(ss.str().c_str(),0x8000);
  for(auto&l:r.listing){std::string s=l.source;size_t i=0;while(i<s.size()&&(s[i]==' '||s[i]=='\t'))i++;
    size_t st=i;while(i<s.size()&&(isalnum((unsigned char)s[i])||s[i]=='_'))i++;
    if(i<s.size()&&s[i]==':'&&i>st)sym[s.substr(st,i-st)]=l.address;}
  std::memset(M,0,sizeof(M));std::memcpy(&M[r.origin],r.output.data(),r.output.size());
  cpu.reset(true);cpu.initialise(rd,wr,ior,iow,nc,nc,nullptr);cpu.setIMMode(1);cpu.setIFF1(1);
  int fail=0;
  // --- Blinker: horizontal 3-in-a-row at (12,15..17) should go vertical ---
  clearbuf(); setcell(12,15,1);setcell(12,16,1);setcell(12,17,1);
  gen();
  bool vert = cell(11,16)&&cell(12,16)&&cell(13,16)&&!cell(12,15)&&!cell(12,17);
  printf("blinker -> vertical: %s\n", vert?"OK":"WRONG"); fail+=!vert;
  gen();
  bool horiz = cell(12,15)&&cell(12,16)&&cell(12,17)&&!cell(11,16)&&!cell(13,16);
  printf("blinker -> horizontal again: %s\n", horiz?"OK":"WRONG"); fail+=!horiz;
  // --- Block (2x2 still life) stays put ---
  clearbuf(); setcell(5,5,1);setcell(5,6,1);setcell(6,5,1);setcell(6,6,1);
  gen();
  bool block = cell(5,5)&&cell(5,6)&&cell(6,5)&&cell(6,6);
  int extra=0; for(int y=1;y<=24;y++)for(int x=1;x<=32;x++)extra+=cell(y,x);
  printf("block still-life stable: %s (live=%d, expect 4)\n",(block&&extra==4)?"OK":"WRONG",extra);
  fail+=!(block&&extra==4);
  printf("\n%s\n", fail?"RULES FAIL":"RULES PASS: Conway semantics correct");
  return fail?1:0;
}
