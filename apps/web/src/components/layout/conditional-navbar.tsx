"use client";
import { usePathname } from "next/navigation";
import { Navbar } from "./navbar";
export function ConditionalNavbar(){const pathname=usePathname();const marketing=["/","/features","/solutions","/pricing","/stories","/integrations"];if(pathname?.startsWith("/auth")) return null; if(marketing.includes(pathname??"")) return null; return <Navbar/>;}
