"use client";

import Script from "next/script";

export function WwwUzTracker() {
  return (
    <Script
      id="www-uz-counter"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          // WWW.UZ Counter - hidden tracking
          (function() {
            var top_js = "1.0";
            var top_r = "id=48123&r=" + escape(document.referrer) + "&pg=" + escape(window.location.href);
            document.cookie = "smart_top=1; path=/";
            top_r += "&c=" + (document.cookie ? "Y" : "N");
            
            top_js = "1.1";
            top_r += "&j=" + (navigator.javaEnabled() ? "Y" : "N");
            
            top_js = "1.2";
            top_r += "&wh=" + screen.width + 'x' + screen.height + "&px=" +
              (((navigator.appName.substring(0, 3) == "Mic")) ? screen.colorDepth : screen.pixelDepth);
            
            top_js = "1.3";
            top_r += "&js=" + top_js + "";
            
            var top_rat = "&col=340F6E&t=ffffff&p=BD6F6F";
            var img = document.createElement('img');
            img.src = 'https://cnt0.www.uz/counter/collect?' + top_r + top_rat;
            img.width = 0;
            img.height = 0;
            img.style.display = 'none';
            img.alt = '';
            document.body.appendChild(img);
            
            // NOSCRIPT fallback
            var noscript = document.createElement('noscript');
            var noscriptImg = document.createElement('img');
            noscriptImg.src = 'https://cnt0.www.uz/counter/collect?id=48123&pg=' + escape(window.location.href) + '&col=340F6E&t=ffffff&p=BD6F6F';
            noscriptImg.width = 0;
            noscriptImg.height = 0;
            noscriptImg.style.display = 'none';
            noscript.appendChild(noscriptImg);
            document.body.appendChild(noscript);
          })();
        `,
      }}
    />
  );
}