"use client";
import {useEffect} from "react";
import {installClientDiagnostics} from "@/lib/diagnostics-client";
export function DiagnosticsReporter(){useEffect(()=>installClientDiagnostics(),[]);return null;}