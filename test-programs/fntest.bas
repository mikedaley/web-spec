10 REM Function and binary number test
20 REM
30 REM === User-defined functions ===
40 DEF FN a(x)=x*x
50 DEF FN b(x,y)=x*x+y*y
60 DEF FN c(x)=x*2+1
70 DEF FN m(a,b)=(a+b)/2
80 DEF FN f(n)=n*3.14159/180
90 REM
100 REM === Test DEF FN calls ===
110 PRINT "Square of 7: ";FN a(7)
120 PRINT "Sum of squares 3,4: ";FN b(3,4)
130 PRINT "2*5+1: ";FN c(5)
140 PRINT "Mean of 10,20: ";FN m(10,20)
150 PRINT "Deg to rad 90: ";FN f(90)
160 REM
170 REM === Binary numbers with BIN ===
180 LET a=BIN 00000001
190 LET b=BIN 00000010
200 LET c=BIN 00000100
210 LET d=BIN 00001000
220 LET e=BIN 00010000
230 LET f=BIN 00100000
240 LET g=BIN 01000000
250 LET h=BIN 10000000
260 PRINT "Bit 0: ";a
270 PRINT "Bit 1: ";b
280 PRINT "Bit 2: ";c
290 PRINT "Bit 3: ";d
300 PRINT "Bit 4: ";e
310 PRINT "Bit 5: ";f
320 PRINT "Bit 6: ";g
330 PRINT "Bit 7: ";h
340 REM
350 REM === Binary arithmetic ===
360 LET mask=BIN 11110000
370 LET v=BIN 10101010
380 PRINT "Mask AND v: ";(mask AND v)
390 PRINT "Mask OR v: ";(mask OR v)
400 REM
410 REM === Binary flag patterns ===
420 LET flags=BIN 00000000
430 LET flags=flags+BIN 00000001
440 LET flags=flags+BIN 00000100
450 LET flags=flags+BIN 00010000
460 PRINT "Flags (21): ";flags
470 REM
480 REM === Built-in math functions ===
490 PRINT "SIN(1): ";SIN 1
500 PRINT "COS(0): ";COS 0
510 PRINT "TAN(0.5): ";TAN 0.5
520 PRINT "SQR(144): ";SQR 144
530 PRINT "ABS(-42): ";ABS -42
540 PRINT "INT(3.7): ";INT 3.7
550 PRINT "SGN(-5): ";SGN -5
560 PRINT "LN(2.718): ";LN 2.718
570 PRINT "EXP(1): ";EXP 1
580 PRINT "PI: ";PI
590 REM
600 REM === String functions ===
610 LET a$="SPECTRUM"
620 PRINT "LEN: ";LEN a$
630 PRINT "CODE: ";CODE a$
640 PRINT "CHR$ 65: ";CHR$ 65
650 PRINT "VAL 42: ";VAL "42"
660 PRINT "STR$ 99: ";STR$ 99
670 REM
680 REM === Nested FN with built-ins ===
690 DEF FN h(r)=PI*r*r
700 PRINT "Circle area r=5: ";FN h(5)
710 DEF FN p(b,e)=b*2+e
720 PRINT "FN with BIN args: ";FN p(BIN 00000011,BIN 00000001)
730 REM
740 REM === Power loop ===
750 FOR n=0 TO 7
760 PRINT "2^";n;" = ";2^n
770 NEXT n
780 REM
790 REM === PEEK with binary address ===
800 LET addr=BIN 0101110000111010
810 PRINT "ERR_NR addr: ";addr
820 PRINT "ERR_NR val: ";PEEK addr
830 REM
840 PRINT "All tests complete"
