; =====================================================================
;  Conway's Game of Life  -  ZX Spectrum 48K  -  "text mode" (32x24)
; ---------------------------------------------------------------------
;  Renders into the attribute file ($5800) so each character cell is a
;  single Life cell.  The whole bitmap is filled with solid pixels once,
;  so the cell colour is entirely the INK colour of its attribute byte:
;       alive = bright green block      dead = black
;
;  Grid is stored with a 1-cell border all around (34 x 26) so the inner
;  update loop never needs edge tests - every interior cell has 8 valid
;  neighbours.  Before each generation the border ring is filled from the
;  opposite edges (WRAP), making the field toroidal: patterns that leave
;  one side re-enter the other instead of crashing into a wall.
;
;  As a safety net, when the live population drops below THRESHOLD the
;  grid is automatically reseeded, so it always keeps running.
;
;  Run from BASIC:   RANDOMIZE USR 32768
;  Press SPACE to return to BASIC.
;
;  Assembles with the emulator's built-in Z80 assembler.  ORG is 32768
;  ($8000); assemble, then RANDOMIZE USR 32768.
; =====================================================================

W         EQU 34            ; grid width  inc. 1-cell border each side
H         EQU 26            ; grid height inc. border
CW        EQU 32            ; visible columns
CH        EQU 24            ; visible rows
GRIDSZ    EQU W*H           ; bytes per generation buffer (884)
THRESHOLD EQU 32            ; reseed when live cells fall below this

ATTR      EQU 5800h         ; attribute file
DISP      EQU 4000h         ; display (bitmap) file
A_ALIVE   EQU 044h          ; BRIGHT + green INK
A_DEAD    EQU 000h          ; black INK

        ORG 8000h

start:
        ; ----- black border, and flood the bitmap with solid pixels ---
        xor a
        out (254),a         ; border black
        ld hl,DISP
        ld de,DISP+1
        ld bc,6144-1
        ld (hl),0FFh
        ldir                ; every pixel = ink

        call clear_grid     ; zero both buffers (borders stay 0 forever)
        call seed           ; random soup into the current buffer

; ---------------------------------------------------------------------
main_loop:
        call render         ; current generation -> attribute file
        call wrap           ; fill border ring from opposite edges (toroidal)
        call step           ; compute next generation into other buffer
        call swap           ; make it the current one
        call check_pop      ; reseed if nearly dead
        call delay

        ld bc,07FFEh        ; keyboard half-row with SPACE on bit 0
        in a,(c)
        and 1               ; 0 = SPACE pressed (keys are active-low)
        jr nz,main_loop     ; not pressed -> keep going
        ret                 ; back to BASIC

; ---------------------------------------------------------------------
;  WRAP - make the current buffer toroidal by copying opposite edges into
;  the border ring.  Columns are done first, then full-width rows, so the
;  corner ghost cells end up holding the diagonally-opposite interior cell.
;    IX = current row start    B = row counter    DE = row stride (W)
; ---------------------------------------------------------------------
wrap:
        ld ix,(curGrid)
        ld de,W
        add ix,de           ; IX = interior row 1 start
        ld b,CH             ; rows 1..24
wrap_cols:
        ld a,(ix+CW)        ; [r][32]  -> left border [r][0]
        ld (ix+0),a
        ld a,(ix+1)         ; [r][1]   -> right border [r][33]
        ld (ix+W-1),a
        add ix,de           ; next row (DE still = W)
        djnz wrap_cols

        ; top border row 0 <- interior bottom row (row CH); full width
        ld hl,(curGrid)
        ld bc,CH*W
        add hl,bc           ; HL = &row24 (source)
        ld de,(curGrid)     ; DE = &row0  (dest)
        ld bc,W
        ldir

        ; bottom border row (H-1) <- interior top row (row 1); full width
        ld hl,(curGrid)
        ld bc,(H-1)*W
        add hl,bc           ; &row25 (dest)
        ex de,hl            ; DE = &row25
        ld hl,(curGrid)
        ld bc,W
        add hl,bc           ; HL = &row1 (source)
        ld bc,W
        ldir
        ret

; ---------------------------------------------------------------------
;  STEP - compute the next generation
;    IX = pointer to "row above, column-1" of the cell being evaluated
;         (i.e. the top-left of its 3x3 neighbourhood)
;    HL = destination pointer in the next-gen buffer
;    B  = column counter (32)   C = row counter (24)
;    D  = neighbour count       E = current cell state
; ---------------------------------------------------------------------
step:
        ld hl,(curGrid)
        push hl
        pop ix              ; IX = cur (top-left of cell (1,1)'s 3x3)

        ld hl,(nxtGrid)
        ld bc,W+1
        add hl,bc           ; HL = first interior cell in next buffer

        ld c,CH             ; rows
step_row:
        ld b,CW             ; cols
step_col:
        ld a,(ix+0)         ; --- sum the 8 neighbours ---
        add a,(ix+1)
        add a,(ix+2)
        add a,(ix+W)        ; same row, left
        add a,(ix+W+2)      ; same row, right  (centre = ix+W+1 skipped)
        add a,(ix+2*W)
        add a,(ix+2*W+1)
        add a,(ix+2*W+2)
        ld d,a              ; D = neighbour count (0..8)

        ld a,(ix+W+1)       ; E = the cell itself
        or a
        jr z,st_dead

        ; alive cell survives on 2 or 3 neighbours
        ld a,d
        cp 2
        jr z,st_alive
        cp 3
        jr z,st_alive
        jr st_zero

st_dead:                    ; dead cell is born on exactly 3 neighbours
        ld a,d
        cp 3
        jr z,st_alive

st_zero:
        xor a
        jr st_put
st_alive:
        ld a,1
st_put:
        ld (hl),a
        inc hl
        inc ix
        djnz step_col

        inc hl              ; skip the 2 border columns to next row
        inc hl
        inc ix
        inc ix
        dec c
        jr nz,step_row
        ret

; ---------------------------------------------------------------------
;  RENDER - current generation -> attribute file
; ---------------------------------------------------------------------
render:
        ld hl,(curGrid)
        ld de,W+1
        add hl,de           ; HL = first interior cell
        ld de,ATTR          ; DE = attribute file (contiguous 32x24)
        ld c,CH
rn_row:
        ld b,CW
rn_col:
        ld a,(hl)
        or a
        ld a,A_DEAD
        jr z,rn_put
        ld a,A_ALIVE
rn_put:
        ld (de),a
        inc de
        inc hl
        djnz rn_col
        inc hl              ; skip border columns
        inc hl
        dec c
        jr nz,rn_row
        ret

; ---------------------------------------------------------------------
;  CHECK_POP - count live cells in the current buffer; reseed if too few
;    DE = population accumulator   B = col counter   C = row counter
; ---------------------------------------------------------------------
check_pop:
        ld hl,(curGrid)
        ld de,W+1
        add hl,de           ; first interior cell
        ld de,0             ; DE = population count
        ld c,CH
cp_row:
        ld b,CW
cp_col:
        ld a,(hl)
        or a
        jr z,cp_skip
        inc de
cp_skip:
        inc hl
        djnz cp_col
        inc hl              ; skip border columns
        inc hl
        dec c
        jr nz,cp_row

        ld a,d              ; population >= 256 ? -> plenty alive
        or a
        ret nz
        ld a,e
        cp THRESHOLD
        ret nc              ; e >= THRESHOLD -> leave it running
        jp seed             ; too few -> reseed (tail call)

; ---------------------------------------------------------------------
;  SWAP current / next buffer pointers
; ---------------------------------------------------------------------
swap:
        ld hl,(curGrid)
        ld de,(nxtGrid)
        ld (curGrid),de
        ld (nxtGrid),hl
        ret

; ---------------------------------------------------------------------
;  CLEAR both generation buffers
; ---------------------------------------------------------------------
clear_grid:
        ld hl,buf0
        ld de,buf0+1
        ld bc,(GRIDSZ*2)-1
        ld (hl),0
        ldir
        ret

; ---------------------------------------------------------------------
;  SEED - fill interior cells of the current buffer from a 16-bit Galois
;  LFSR (period 65535, feedback poly $B400) for ~50% density true noise.
;  State is (re)initialised from the R register each call.
; ---------------------------------------------------------------------
seed:
        ld a,r              ; build a nonzero 16-bit seed from R
        ld l,a
        ld a,r
        ld h,a
        ld a,h
        or l
        jr nz,sd_ok
        ld hl,0ACE1h        ; state must not be zero
sd_ok:
        ld (rngState),hl

        ld hl,(curGrid)
        ld de,W+1
        add hl,de           ; first interior cell
        ld c,CH
sd_row:
        ld b,CW
sd_col:
        call rng16          ; A = one random bit (0/1); HL,BC preserved
        ld (hl),a
        inc hl
        djnz sd_col
        inc hl              ; skip border columns
        inc hl
        dec c
        jr nz,sd_row
        ret

; ---------------------------------------------------------------------
;  RNG16 - advance the 16-bit Galois LFSR, return bit 0 in A.
;  Preserves HL and BC.
; ---------------------------------------------------------------------
rng16:
        push hl
        ld hl,(rngState)
        srl h               ; HL >>= 1, old bit 0 -> carry
        rr l
        jr nc,rng_nx
        ld a,h              ; tap: XOR high byte with $B4 (poly $B400)
        xor $B4
        ld h,a
rng_nx:
        ld (rngState),hl
        ld a,l
        and 1               ; one random bit
        pop hl
        ret

; ---------------------------------------------------------------------
;  DELAY - ~4 frames (~80 ms) using the 50Hz interrupt
; ---------------------------------------------------------------------
delay:
        ld b,4
dly1:
        halt
        djnz dly1
        ret

; ---------------------------------------------------------------------
;  Variables and buffers
; ---------------------------------------------------------------------
curGrid:  DW buf0
nxtGrid:  DW buf1
rngState: DW 0ACE1h

buf0:   DS GRIDSZ
buf1:   DS GRIDSZ
