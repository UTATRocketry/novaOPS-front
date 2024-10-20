import Head from "next/head";
import Image from "next/image";

import styles from "@/styles/Home.module.css";

import { Flex, Spacer,  Box, Center, Text, FormControl, FormLabel, SimpleGrid} from '@chakra-ui/react'
import { Switch, Divider } from '@chakra-ui/react'
import {useState, useEffect} from 'react'

//Graph Imports
import PressureGraph from "./pressureG";
import FlowVelocityGraph from "./flowvelocity";

import PIDDiagram from "./diagram";



export default function Home() {

  const [bvftp, SetBvftp] = useState(false);
  const [rftp, Setrftp] = useState(false);
  const [rvft, Setrvft] = useState(false);
  const [bvftb, Setbvftb] = useState(false);
  const [mfv, Setmfv] = useState(false);
  const [eventArray, seteventArray] = useState([])

  
  function addRFTP(e: any) {
    const currentTime = new Date().toLocaleString(); // Get the current time
    Setrftp(e.target.checked);
    seteventArray(prevArray => [
      ...prevArray,
      { event: "RFTP", value: e.target.checked, time: currentTime }
    ]);
  }

  function addBVFTP(e: any) {
    const currentTime = new Date().toLocaleString(); // Get the current time
    SetBvftp(e.target.checked);
    seteventArray(prevArray => [
      ...prevArray,
      { event: "BVFTP", value: e.target.checked, time: currentTime }
    ]);
  }

  function addRVFT(e: any) {
    const currentTime = new Date().toLocaleString(); // Get the current time
    Setrvft(e.target.checked);
    seteventArray(prevArray => [
      ...prevArray,
      { event: "RVFT", value: e.target.checked, time: currentTime }
    ]);
  }

  function addBVFTB(e: any) {
    const currentTime = new Date().toLocaleString(); // Get the current time
    Setbvftb(e.target.checked);
    seteventArray(prevArray => [
      ...prevArray,
      { event: "BVFTB", value: e.target.checked, time: currentTime }
    ]);
  }

  function addMFV(e: any) {
    const currentTime = new Date().toLocaleString(); // Get the current time
    Setmfv(e.target.checked);
    seteventArray(prevArray => [
      ...prevArray,
      { event: "MFV", value: e.target.checked, time: currentTime }
    ]);
  }


  useEffect(() => {
    if (bvftp == true) {
      console.log("it is true")
      console.log(bvftp)
    }
  })


  return (
    <>
    <div>
      <PIDDiagram />
    </div>
    
      
          
          
          
          

    </>
  )
}
