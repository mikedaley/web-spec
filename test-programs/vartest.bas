10 REM variable type test
20 LET a=42
30 LET b=3.14159
40 LET score=12345
50 LET x=-7
60 LET a$="Hello"
70 LET b$="ZX Spectrum"
80 DIM c(5)
90 FOR n=1 TO 5
100 LET c(n)=n*10
110 NEXT n
120 DIM d(3,4)
130 FOR i=1 TO 3
140 FOR j=1 TO 4
150 LET d(i,j)=i*10+j
160 NEXT j
170 NEXT i
180 DIM e$(4,8)
190 LET e$(1)="Monday"
200 LET e$(2)="Tuesday"
210 LET e$(3)="Friday"
220 LET e$(4)="Sunday"
230 DIM f$(2,3,6)
240 LET f$(1,1)="Red"
250 LET f$(1,2)="Green"
260 LET f$(1,3)="Blue"
270 LET f$(2,1)="Cyan"
280 LET f$(2,2)="Yellow"
290 LET f$(2,3)="White"
300 FOR n=1 TO 10 STEP 2
310 NEXT n
320 PRINT "All variables created"
