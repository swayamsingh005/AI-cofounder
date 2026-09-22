import Link from 'next/link';
import type { ReactNode } from 'react';

export default function PublicInfoPage({title,intro,children}:{title:string;intro:string;children:ReactNode}) {
  return <main style={{maxWidth:860,margin:'0 auto',padding:'48px 24px 80px',lineHeight:1.7,color:'#eaf2ff'}}>
    <Link href="/" style={{color:'#9f86ff',textDecoration:'none'}}>← AI Co-Founder</Link>
    <h1 style={{fontSize:'clamp(2rem,5vw,3.5rem)',margin:'28px 0 12px'}}>{title}</h1>
    <p style={{fontSize:'1.1rem',color:'#a9bdd8',marginBottom:36}}>{intro}</p>
    <article style={{display:'grid',gap:28}}>{children}</article>
  </main>;
}

export function InfoSection({title,children}:{title:string;children:ReactNode}) {
  return <section style={{padding:'24px',border:'1px solid #213750',borderRadius:16,background:'#091827'}}><h2 style={{marginTop:0}}>{title}</h2><div style={{color:'#bdd0e9'}}>{children}</div></section>;
}
