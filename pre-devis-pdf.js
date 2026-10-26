'use strict';
const BuilderQuotePDF=(()=>{
  let loading;
  function load(){if(window.jspdf?.jsPDF)return Promise.resolve();return loading??=(async()=>{for(const path of ['vendor/jspdf/jspdf.umd.min.js','vendor/jspdf/jspdf.plugin.autotable.min.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL(path,document.baseURI).href;s.onload=resolve;s.onerror=()=>reject(new Error('Bibliothèque PDF locale manquante.'));document.head.append(s);});})();}
  const plain=s=>String(s??'').replace(/[\u202f\u00a0]/g,' ').replace(/[–—]/g,'-').replace(/²/g,'2');
  const eu=n=>plain(n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
  function build(data,PDF){const doc=new PDF({unit:'mm',format:'a4'}),c=data.company,t=data.totals;let y=18;
    doc.setTextColor(22,51,61);doc.setFont('helvetica','bold');doc.setFontSize(19);doc.text('PRÉ-DEVIS',195,y,{align:'right'});doc.setFontSize(11);const companyName=doc.splitTextToSize(plain(c.name||'Entreprise à renseigner'),110);doc.text(companyName,15,y);y+=Math.max(7,companyName.length*5+2);
    if(c.logo){const props=doc.getImageProperties(c.logo),h=Math.min(20,30*props.height/props.width);doc.addImage(c.logo,props.fileType,15,y,30,h);y+=h+4;}
    doc.setFont('helvetica','normal');doc.setFontSize(9);
    function block(text,width=180){if(!text)return;const ls=doc.splitTextToSize(plain(text),width);for(const line of ls){if(y>272){doc.addPage();y=18;}doc.text(line,15,y);y+=4.5;}y+=2;}
    block([c.address,c.phone,c.email,c.siret?'SIRET : '+c.siret:'',c.vatNumber?'TVA : '+c.vatNumber:''].filter(Boolean).join('\n'));
    block('Référence : '+data.commercial.quoteReference+'    Date : '+data.date);
    const client=data.client,site=data.projectInfo;
    doc.autoTable({startY:y,head:[['CLIENT','CHANTIER']],body:[[plain([client.name,client.address,client.phone,client.email].filter(Boolean).join('\n')||'Non renseigné'),plain([site.reference,site.siteAddress,site.notes].filter(Boolean).join('\n')||'Non renseigné')]],theme:'grid',margin:{left:15,right:15,bottom:18},styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:[22,82,78]}});y=doc.lastAutoTable.finalY+8;
    function section(title,rows,subtotal){if(y>245){doc.addPage();y=18;}doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(title,15,y);y+=4;doc.autoTable({startY:y,head:[['Désignation','Qté','Unité','PU HT','Total HT']],body:rows.map(row=>row.map(plain)),foot:[['Sous-total '+title.toLowerCase()+' HT','','','',eu(subtotal)]],theme:'striped',margin:{left:15,right:15,bottom:18},styles:{fontSize:9,cellPadding:2.5,overflow:'linebreak'},columnStyles:{0:{cellWidth:80},1:{cellWidth:19,halign:'right'},2:{cellWidth:19},3:{cellWidth:29,halign:'right'},4:{cellWidth:33,halign:'right'}},headStyles:{fillColor:[22,82,78]},footStyles:{fillColor:[239,244,246],textColor:[22,51,61],fontStyle:'bold'}});y=doc.lastAutoTable.finalY+8;}
    section('MATÉRIAUX',data.materials,t.materialsHT);
    const rows=ls=>ls.map(l=>[l.description,l.quantity.toLocaleString('fr-FR'),l.unit,eu(l.unitPriceHT),eu(BuilderCommercial.lineTotal(l))]);
    section('MAIN-D’ŒUVRE',rows(data.commercial.laborLines),t.laborHT);if(data.commercial.otherLines.length)section('AUTRES / OPTIONS',rows(data.commercial.otherLines),t.otherHT);
    doc.autoTable({startY:y,body:[['TOTAL HT',eu(t.totalHT)],[`TVA ${t.vatRate} %`,eu(t.vat)],['TOTAL TTC',eu(t.totalTTC)]],margin:{left:100,right:15,bottom:18},theme:'grid',styles:{fontSize:11,cellPadding:3},columnStyles:{1:{halign:'right'}},didParseCell(d){if(d.row.index===2){d.cell.styles.fillColor=[22,82,78];d.cell.styles.textColor=[255,255,255];d.cell.styles.fontStyle='bold';}}});y=doc.lastAutoTable.finalY+8;doc.setFontSize(9);doc.setFont('helvetica','normal');block(data.commercial.quoteNotes);
    const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(100);doc.text(plain('PRÉ-DEVIS · '+data.commercial.quoteReference),15,287);doc.text(`${i} / ${pages}`,195,287,{align:'right'});}return doc;
  }
  return {load,build,async generate(data){await load();return build(data,window.jspdf.jsPDF);}};
})();
if(typeof window!=='undefined')window.BuilderQuotePDF=BuilderQuotePDF;
