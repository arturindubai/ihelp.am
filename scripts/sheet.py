import sys
from PIL import Image
for n in sys.argv[1:]:
  im=Image.open(n); w=390; h=int(im.height*w/im.width); im=im.resize((w,h))
  H=844; cols=min(6,(h+H-1)//H); sheet=Image.new('RGB',((w+10)*cols,H),'#888')
  for i in range(cols): sheet.paste(im.crop((0,i*H,w,min(h,(i+1)*H))),(i*(w+10),0))
  sheet.save(n.replace('.png','_s.png'))
