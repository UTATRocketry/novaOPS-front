'use client';
import { useEffect, useState } from 'react';
import {
    Button,
    Text,
    useToast,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    useDisclosure,
} from "@chakra-ui/react";
import Parser from './parser';
const TestPage: React.FC = () => {
    const {
        isOpen: isParserOpen,
        onOpen: onParserOpen,
        onClose: onParserClose,
    } = useDisclosure();
    return (
        <div style={{position: 'relative', width: '100%', textAlign: 'center'}}>
            <h1>Testing Page</h1>
            <p>This page is for testing purposes.</p>
            
        </div>
    );
}
export default TestPage;
// <Heading as='h2' size='lg' mb={4}>Upload New Diagram</Heading>