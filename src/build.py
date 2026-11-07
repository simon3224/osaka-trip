js = "\n".join(open(f).read() for f in ["cities_head.js","data_osaka.js","data_tokyo.js","data_taipei.js","city.js","spot_icons.js","models.js","planner.js","app.js","trip.js"])
html = open("shell.html").read().replace("/*__APP__*/", js)
open("index.html","w").write(html)
print(len(html))
